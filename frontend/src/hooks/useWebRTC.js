import { useRef, useState, useCallback } from "react";
import { getSocket } from "../services/socket";

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
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
  sdpSemantics: "unified-plan",
};

// ─── Audio constraints: highest quality WebRTC allows in a browser ───────────
// autoGainControl: false  → don't let the browser silently lower your mic volume
// noiseSuppression: false → browser's built-in suppressor smears voice; we keep
//                           echoCancellation ON (that one is actually helpful)
// sampleRate: 48000       → Opus codec native rate; anything higher gets resampled
//                           down anyway so asking for 48 k is the sweet spot
// channelCount: 1         → voice calls are mono; stereo doubles bitrate for no
//                           perceptible gain and is often down-mixed by the codec
const AUDIO_CONSTRAINTS = {
  echoCancellation: true,   // keeps: prevents speaker bleed into mic
  noiseSuppression: false,  // off: browser's NS degrades voice naturalness
  autoGainControl: false,   // off: prevents mic riding / pumping artefacts
  sampleRate: 48000,
  channelCount: 1,
};

// ─── Video constraints: 1080p preferred, falls back gracefully ───────────────
// ideal/min/max pattern: browser picks the best mode the camera supports;
// it won't reject getUserMedia if the camera can't hit 1080p — it just
// gives you whatever is closest (e.g. 720p on a laptop webcam).
const VIDEO_CONSTRAINTS = {
  width:     { min: 640,  ideal: 1920, max: 1920 },
  height:    { min: 480,  ideal: 1080, max: 1080 },
  frameRate: { min: 24,   ideal: 30,   max: 60   },
  facingMode: "user",
};

// ─── Apply codec & bandwidth preferences to the SDP after negotiation ────────
// RTCRtpSender.setParameters() lets us raise the max bitrate the encoder
// is allowed to use. Without this the browser defaults to ~500 kbps video
// and ~32 kbps audio which is noticeably blurry / tinny.
//   video: 2.5 Mbps  — enough for 1080p@30 without killing mobile data
//   audio: 128 kbps  — Opus at 128 kbps is transparent / indistinguishable
//                       from uncompressed at normal listening distances
async function applyBitrateHints(pc) {
  for (const sender of pc.getSenders()) {
    const track = sender.track;
    if (!track) continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      if (track.kind === "video") {
        params.encodings[0].maxBitrate = 2_500_000; // 2.5 Mbps
      } else if (track.kind === "audio") {
        params.encodings[0].maxBitrate = 128_000;   // 128 kbps
      }
      await sender.setParameters(params);
    } catch {
      // setParameters can throw if called at the wrong moment; safe to ignore
    }
  }
}

export function useWebRTC({ onCallEnded, onCallRecord } = {}) {
  const pcRef              = useRef(null);
  const localStreamRef     = useRef(null);
  const pendingOfferRef    = useRef(null);
  const iceCandidateBuffer = useRef([]);
  const isInitiatorRef     = useRef(false);
  const callStartRef       = useRef(null);
  const callTypeRef        = useRef("audio");
  const remoteUserIdRef    = useRef(null);

  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream,  setLocalStream]  = useState(null);
  const [callState,    setCallState]    = useState("idle");
  const [callType,     setCallType]     = useState("audio");
  const [remoteUserId, setRemoteUserId] = useState(null);

  function getDuration() {
    if (!callStartRef.current) return 0;
    return Math.round((Date.now() - callStartRef.current) / 1000);
  }

  async function flushIceCandidates(pc) {
    const buffered = iceCandidateBuffer.current.splice(0);
    for (const candidate of buffered) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    }
  }

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current           = null;
    pendingOfferRef.current = null;
    iceCandidateBuffer.current  = [];
    isInitiatorRef.current      = false;
    callStartRef.current        = null;
    remoteUserIdRef.current     = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallState("idle");
    setRemoteUserId(null);
  }, []);

  const createPC = useCallback(
    (targetId, type) => {
      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;

      pc.addTransceiver("audio", { direction: "sendrecv" });
      if (type === "video") {
        pc.addTransceiver("video", { direction: "sendrecv" });
      }

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          getSocket()?.emit("webrtc_ice_candidate", {
            targetUserId: targetId,
            candidate,
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[WebRTC] ICE state:", pc.iceConnectionState);
      };

      pc.ontrack = (e) => {
        console.log("[WebRTC] ontrack — streams:", e.streams.length);
        const stream = e.streams?.[0] ?? new MediaStream([e.track]);
        setRemoteStream(stream);
      };

      pc.onconnectionstatechange = () => {
        console.log("[WebRTC] connection state:", pc.connectionState);
        // "disconnected" is transient on mobile — only hard-fail on failed/closed
        if (["failed", "closed"].includes(pc.connectionState)) {
          const dur = getDuration();
          onCallRecord?.(
            callTypeRef.current,
            dur > 0 ? "ended" : "missed",
            dur,
            isInitiatorRef.current,
          );
          cleanup();
          onCallEnded?.();
        }
      };

      return pc;
    },
    [cleanup, onCallEnded, onCallRecord],
  );

  const startCall = useCallback(
    async (targetId, type = "audio") => {
      if (!targetId) return;
      isInitiatorRef.current  = true;
      callTypeRef.current     = type;
      remoteUserIdRef.current = targetId;
      setCallType(type);
      setRemoteUserId(targetId);
      setCallState("calling");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS,
          video: type === "video" ? VIDEO_CONSTRAINTS : false,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);

        const pc = createPC(targetId, type);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: type === "video",
        });
        await pc.setLocalDescription(offer);

        // Apply bitrate hints right after local description is set
        await applyBitrateHints(pc);

        getSocket()?.emit("webrtc_offer", {
          targetUserId: targetId,
          offer,
          callType: type,
        });
      } catch (err) {
        console.error("[WebRTC] startCall:", err);
        cleanup();
      }
    },
    [createPC, cleanup],
  );

  const handleIncomingOffer = useCallback(
    ({ fromUserId, offer, callType: type }) => {
      pendingOfferRef.current     = offer;
      iceCandidateBuffer.current  = [];
      callTypeRef.current         = type ?? "audio";
      remoteUserIdRef.current     = fromUserId;
      setRemoteUserId(fromUserId);
      setCallType(type ?? "audio");
      setCallState("incoming");
    },
    [],
  );

  const acceptCall = useCallback(async () => {
    const pending  = pendingOfferRef.current;
    const targetId = remoteUserIdRef.current;
    if (!pending || !targetId) return;

    const type = callTypeRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
        video: type === "video" ? VIDEO_CONSTRAINTS : false,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPC(targetId, type);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(pending));
      pendingOfferRef.current = null;

      await flushIceCandidates(pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Apply bitrate hints right after local description is set
      await applyBitrateHints(pc);

      getSocket()?.emit("webrtc_answer", { targetUserId: targetId, answer });

      callStartRef.current = Date.now();
      setCallState("active");
    } catch (err) {
      console.error("[WebRTC] acceptCall:", err);
      cleanup();
    }
  }, [createPC, cleanup]);

  const handleAnswer = useCallback(async ({ answer }) => {
    if (!pcRef.current) return;
    try {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      await flushIceCandidates(pcRef.current);
      // Also apply bitrate hints on the answerer side once remote desc is set
      await applyBitrateHints(pcRef.current);
      callStartRef.current = Date.now();
      setCallState("active");
    } catch (err) {
      console.error("[WebRTC] handleAnswer:", err);
    }
  }, []);

  const handleIceCandidate = useCallback(async ({ candidate }) => {
    if (!candidate) return;

    if (!pcRef.current || pendingOfferRef.current) {
      iceCandidateBuffer.current.push(candidate);
      return;
    }

    if (pcRef.current.remoteDescription?.type) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    } else {
      iceCandidateBuffer.current.push(candidate);
    }
  }, []);

  const rejectCall = useCallback(() => {
    getSocket()?.emit("webrtc_reject", { targetUserId: remoteUserIdRef.current });
    onCallRecord?.(callTypeRef.current, "declined", 0, false);
    cleanup();
  }, [cleanup, onCallRecord]);

  const endCall = useCallback(() => {
    const dur      = getDuration();
    const wasActive = callStartRef.current !== null;
    const initiator = isInitiatorRef.current;
    getSocket()?.emit("webrtc_end", { targetUserId: remoteUserIdRef.current });
    onCallRecord?.(
      callTypeRef.current,
      wasActive ? "ended" : initiator ? "missed" : "declined",
      dur,
      initiator,
    );
    cleanup();
    onCallEnded?.();
  }, [cleanup, onCallEnded, onCallRecord]);

  const handleRemoteEnd = useCallback(() => {
    const dur      = getDuration();
    const wasActive = callStartRef.current !== null;
    const initiator = isInitiatorRef.current;
    onCallRecord?.(
      callTypeRef.current,
      wasActive ? "ended" : initiator ? "missed" : "declined",
      dur,
      initiator,
    );
    cleanup();
    onCallEnded?.();
  }, [cleanup, onCallEnded, onCallRecord]);

  const handleRemoteReject = useCallback(() => {
    onCallRecord?.(callTypeRef.current, "declined", 0, isInitiatorRef.current);
    cleanup();
    onCallEnded?.();
  }, [cleanup, onCallEnded, onCallRecord]);

  return {
    callState,
    callType,
    remoteUserId,
    localStream,
    remoteStream,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    handleIncomingOffer,
    handleAnswer,
    handleIceCandidate,
    handleRemoteEnd,
    handleRemoteReject,
  };
}
