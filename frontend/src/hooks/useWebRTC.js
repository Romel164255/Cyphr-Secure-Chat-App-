import { useRef, useState, useCallback } from "react";
import { getSocket } from "../services/socket";

// STUN = discovers public IP (free, works ~60% of the time)
// TURN = relays traffic when direct connection fails (critical for India/mobile networks)
// These are free public TURN servers from Open Relay (metered.ca)
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    // Free TURN relay — needed for symmetric NAT (mobile networks, most ISPs in India)
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

export function useWebRTC({ onCallEnded, onCallRecord } = {}) {
  const pcRef              = useRef(null);
  const localStreamRef     = useRef(null);
  const pendingOfferRef    = useRef(null);
  const iceCandidateBuffer = useRef([]);   // buffer candidates until remote desc is set
  const isInitiatorRef     = useRef(false);
  const callStartRef       = useRef(null);
  const callTypeRef        = useRef("audio");
  const remoteUserIdRef    = useRef(null);  // stable ref for async callbacks

  const [remoteStream, setRemoteStream] = useState(null);
  const [callState,    setCallState]    = useState("idle");
  const [callType,     setCallType]     = useState("audio");
  const [remoteUserId, setRemoteUserId] = useState(null);

  function getDuration() {
    if (!callStartRef.current) return 0;
    return Math.round((Date.now() - callStartRef.current) / 1000);
  }

  /* ── Flush buffered ICE candidates once remote desc is set ── */
  async function flushIceCandidates(pc) {
    const buffered = iceCandidateBuffer.current.splice(0);
    for (const candidate of buffered) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    }
  }

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current       = null;
    pcRef.current?.close();
    pcRef.current                = null;
    pendingOfferRef.current      = null;
    iceCandidateBuffer.current   = [];
    isInitiatorRef.current       = false;
    callStartRef.current         = null;
    remoteUserIdRef.current      = null;
    setRemoteStream(null);
    setCallState("idle");
    setRemoteUserId(null);
  }, []);

  const createPC = useCallback((targetId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        getSocket()?.emit("webrtc_ice_candidate", { targetUserId: targetId, candidate });
      }
    };

    // Log ICE state for debugging
    pc.oniceconnectionstatechange = () => {
      console.log("[WebRTC] ICE state:", pc.iceConnectionState);
    };

    pc.ontrack = (e) => {
      console.log("[WebRTC] ontrack — streams:", e.streams.length);
      setRemoteStream(e.streams[0] ?? null);
    };

    pc.onconnectionstatechange = () => {
      console.log("[WebRTC] connection state:", pc.connectionState);
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        const dur = getDuration();
        onCallRecord?.(callTypeRef.current, dur > 0 ? "ended" : "missed", dur, isInitiatorRef.current);
        cleanup();
        onCallEnded?.();
      }
    };

    return pc;
  }, [cleanup, onCallEnded, onCallRecord]);

  /* ── Outgoing call ── */
  const startCall = useCallback(async (targetId, type = "audio") => {
    if (!targetId) return;
    isInitiatorRef.current  = true;
    callTypeRef.current     = type;
    remoteUserIdRef.current = targetId;
    setCallType(type);
    setRemoteUserId(targetId);
    setCallState("calling");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === "video" ? { width: 1280, height: 720 } : false,
      });
      localStreamRef.current = stream;
      const pc = createPC(targetId);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      getSocket()?.emit("webrtc_offer", { targetUserId: targetId, offer, callType: type });
    } catch (err) {
      console.error("[WebRTC] startCall:", err);
      cleanup();
    }
  }, [createPC, cleanup]);

  /* ── Incoming offer — just store it, don't create PC yet ── */
  const handleIncomingOffer = useCallback(({ fromUserId, offer, callType: type }) => {
    pendingOfferRef.current  = offer;
    iceCandidateBuffer.current = [];   // reset buffer for new call
    callTypeRef.current      = type ?? "audio";
    remoteUserIdRef.current  = fromUserId;
    setRemoteUserId(fromUserId);
    setCallType(type ?? "audio");
    setCallState("incoming");
  }, []);

  /* ── Accept call: create PC, set remote desc, THEN flush buffered candidates ── */
  const acceptCall = useCallback(async () => {
    const pending  = pendingOfferRef.current;
    const targetId = remoteUserIdRef.current;
    if (!pending || !targetId) return;

    const type = callTypeRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === "video" ? { width: 1280, height: 720 } : false,
      });
      localStreamRef.current = stream;

      const pc = createPC(targetId);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      // 1. Set remote description (the offer)
      await pc.setRemoteDescription(new RTCSessionDescription(pending));
      pendingOfferRef.current = null;  // mark as consumed

      // 2. Flush any ICE candidates that arrived before we accepted
      await flushIceCandidates(pc);

      // 3. Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      getSocket()?.emit("webrtc_answer", { targetUserId: targetId, answer });

      callStartRef.current = Date.now();
      setCallState("active");
    } catch (err) {
      console.error("[WebRTC] acceptCall:", err);
      cleanup();
    }
  }, [createPC, cleanup]);

  /* ── Answer received (caller side) ── */
  const handleAnswer = useCallback(async ({ answer }) => {
    if (!pcRef.current) return;
    try {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      // Flush any candidates that arrived before we got the answer
      await flushIceCandidates(pcRef.current);
      callStartRef.current = Date.now();
      setCallState("active");
    } catch (err) {
      console.error("[WebRTC] handleAnswer:", err);
    }
  }, []);

  /* ── ICE candidate ── 
     If remote desc not yet set → buffer it.
     If PC is ready → add immediately. ── */
  const handleIceCandidate = useCallback(async ({ candidate }) => {
    if (!candidate) return;

    // PC doesn't exist yet OR we're waiting for user to accept → buffer
    if (!pcRef.current || pendingOfferRef.current) {
      iceCandidateBuffer.current.push(candidate);
      return;
    }

    // Remote desc might not be set yet (race between answer and candidates)
    if (
      pcRef.current.remoteDescription &&
      pcRef.current.remoteDescription.type
    ) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    } else {
      iceCandidateBuffer.current.push(candidate);
    }
  }, []);

  /* ── Reject ── */
  const rejectCall = useCallback(() => {
    getSocket()?.emit("webrtc_reject", { targetUserId: remoteUserIdRef.current });
    onCallRecord?.(callTypeRef.current, "declined", 0, false);
    cleanup();
  }, [cleanup, onCallRecord]);

  /* ── End call ── */
  const endCall = useCallback(() => {
    const dur       = getDuration();
    const wasActive = callStartRef.current !== null;
    const initiator = isInitiatorRef.current;
    getSocket()?.emit("webrtc_end", { targetUserId: remoteUserIdRef.current });
    onCallRecord?.(callTypeRef.current, wasActive ? "ended" : (initiator ? "missed" : "declined"), dur, initiator);
    cleanup();
    onCallEnded?.();
  }, [cleanup, onCallEnded, onCallRecord]);

  /* ── Remote ended ── */
  const handleRemoteEnd = useCallback(() => {
    const dur       = getDuration();
    const wasActive = callStartRef.current !== null;
    const initiator = isInitiatorRef.current;
    onCallRecord?.(callTypeRef.current, wasActive ? "ended" : (initiator ? "missed" : "declined"), dur, initiator);
    cleanup();
    onCallEnded?.();
  }, [cleanup, onCallEnded, onCallRecord]);

  /* ── Remote rejected ── */
  const handleRemoteReject = useCallback(() => {
    onCallRecord?.(callTypeRef.current, "declined", 0, isInitiatorRef.current);
    cleanup();
    onCallEnded?.();
  }, [cleanup, onCallEnded, onCallRecord]);

  return {
    callState, callType, remoteUserId,
    localStream: localStreamRef.current,
    remoteStream,
    startCall, acceptCall, rejectCall, endCall,
    handleIncomingOffer, handleAnswer, handleIceCandidate,
    handleRemoteEnd, handleRemoteReject,
  };
}
