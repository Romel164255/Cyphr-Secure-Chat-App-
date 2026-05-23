import { useRef, useState, useCallback } from "react";
import { getSocket } from "../services/socket";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function useWebRTC({ onCallEnded }) {
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callState, setCallState] = useState("idle"); // idle | calling | incoming | active
  const [callType, setCallType] = useState("audio"); // audio | video
  const [remoteUserId, setRemoteUserId] = useState(null);

  const cleanup = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
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

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      setRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        cleanup();
        onCallEnded?.();
      }
    };

    return pc;
  }, [cleanup, onCallEnded]);

  // ── Outgoing call ──
  const startCall = useCallback(async (targetId, type = "audio") => {
    setCallType(type);
    setRemoteUserId(targetId);
    setCallState("calling");

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video",
    });
    localStreamRef.current = stream;

    const pc = createPC(targetId);
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    getSocket()?.emit("webrtc_offer", { targetUserId: targetId, offer, callType: type });
  }, [createPC]);

  // ── Receive incoming offer ──
  const handleIncomingOffer = useCallback(({ fromUserId, offer, callType: type }) => {
    setRemoteUserId(fromUserId);
    setCallType(type);
    setCallState("incoming");
    // Store offer on pc for when user accepts
    pcRef.current = { _pendingOffer: offer }; // temp store
  }, []);

  // ── Accept call ──
  const acceptCall = useCallback(async () => {
    const pending = pcRef.current?._pendingOffer;
    if (!pending || !remoteUserId) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === "video",
    });
    localStreamRef.current = stream;

    const pc = createPC(remoteUserId);
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    await pc.setRemoteDescription(new RTCSessionDescription(pending));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    getSocket()?.emit("webrtc_answer", { targetUserId: remoteUserId, answer });
    setCallState("active");
  }, [remoteUserId, callType, createPC]);

  // ── Handle answer ──
  const handleAnswer = useCallback(async ({ answer }) => {
    await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
    setCallState("active");
  }, []);

  // ── ICE candidate ──
  const handleIceCandidate = useCallback(async ({ candidate }) => {
    if (pcRef.current && !(pcRef.current._pendingOffer)) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch {}
    }
  }, []);

  // ── Reject / end ──
  const rejectCall = useCallback(() => {
    getSocket()?.emit("webrtc_reject", { targetUserId: remoteUserId });
    cleanup();
  }, [remoteUserId, cleanup]);

  const endCall = useCallback(() => {
    getSocket()?.emit("webrtc_end", { targetUserId: remoteUserId });
    cleanup();
    onCallEnded?.();
  }, [remoteUserId, cleanup, onCallEnded]);

  return {
    callState, callType, remoteUserId,
    localStream: localStreamRef.current,
    remoteStream,
    startCall, acceptCall, rejectCall, endCall,
    handleIncomingOffer, handleAnswer, handleIceCandidate,
  };
}