import { useRef, useState, useCallback } from "react";
import { getSocket } from "../services/socket";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function useWebRTC({ onCallEnded } = {}) {
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingOfferRef = useRef(null);

  const [remoteStream, setRemoteStream] = useState(null);
  const [callState, setCallState] = useState("idle");
  const [callType, setCallType] = useState("audio");
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
    pendingOfferRef.current = null;
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
      setRemoteStream(e.streams[0] ?? null);
    };

    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        cleanup();
        onCallEnded?.();
      }
    };

    return pc;
  }, [cleanup, onCallEnded]);

  const startCall = useCallback(async (targetId, type = "audio") => {
    if (!targetId) return;
    setCallType(type);
    setRemoteUserId(targetId);
    setCallState("calling");
    try {
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
    } catch (err) {
      console.error("[WebRTC] startCall:", err);
      cleanup();
    }
  }, [createPC, cleanup]);

  const handleIncomingOffer = useCallback(({ fromUserId, offer, callType: type }) => {
    pendingOfferRef.current = offer;
    setRemoteUserId(fromUserId);
    setCallType(type ?? "audio");
    setCallState("incoming");
  }, []);

  const acceptCall = useCallback(async () => {
    const pending = pendingOfferRef.current;
    if (!pending || !remoteUserId) return;
    try {
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
    } catch (err) {
      console.error("[WebRTC] acceptCall:", err);
      cleanup();
    }
  }, [remoteUserId, callType, createPC, cleanup]);

  const handleAnswer = useCallback(async ({ answer }) => {
    if (!pcRef.current) return;
    try {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      setCallState("active");
    } catch (err) {
      console.error("[WebRTC] handleAnswer:", err);
    }
  }, []);

  const handleIceCandidate = useCallback(async ({ candidate }) => {
    if (!pcRef.current || pendingOfferRef.current) return;
    try {
      await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {}
  }, []);

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
