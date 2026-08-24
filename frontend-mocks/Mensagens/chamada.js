/**
 * chamada.js
 * ------------------------------------------------------------------
 * Chamada de voz e vídeo real (câmera/microfone de verdade), via WebRTC.
 *
 * MODO ATUAL: simulação de front-end, sem back-end.
 * A "sinalização" (troca inicial de offer/answer/ICE) acontece via
 * BroadcastChannel — um canal de comunicação nativo do navegador que
 * só funciona ENTRE ABAS DO MESMO NAVEGADOR E MESMO SITE. Ótimo pra
 * testar o fluxo completo sem precisar de servidor nenhum.
 *
 * PONTO DE INTEGRAÇÃO COM O BACK-END:
 * Quando o time de back-end tiver um servidor de sinalização (WebSocket),
 * troque só a seção "CANAL DE SINALIZAÇÃO" abaixo por conexão real —
 * TODO o resto (WebRTC, UI, controles) continua igual, pois já está
 * desacoplado por meio das funções joinCallRoom() / sendSignal().
 * ------------------------------------------------------------------
 */
 
const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};
 
const callEls = {
  overlay: document.getElementById("callOverlay"),
  info: document.getElementById("callInfo"),
  avatar: document.getElementById("callAvatar"),
  peerName: document.getElementById("callPeerName"),
  statusText: document.getElementById("callStatusText"),
  remoteVideo: document.getElementById("remoteVideo"),
  localVideo: document.getElementById("localVideo"),
  timerBadge: document.getElementById("callTimerBadge"), // NOVO
 
  // Ações de quem RECEBE a chamada
  incomingActions: document.getElementById("callIncomingActions"),
  acceptBtn: document.getElementById("callAcceptBtn"),
  declineBtn: document.getElementById("callDeclineBtn"),
 
  // NOVO: ação de quem LIGOU, enquanto espera o outro atender
  outgoingActions: document.getElementById("callOutgoingActions"),
  cancelBtn: document.getElementById("callCancelBtn"),
 
  // Controles durante a chamada já conectada
  activeControls: document.getElementById("callActiveControls"),
  muteBtn: document.getElementById("callMuteBtn"),
  cameraBtn: document.getElementById("callCameraBtn"),
  hangupBtn: document.getElementById("callHangupBtn"),
};
 
const callState = {
  channel: null,             // BroadcastChannel da sala atual
  currentRoom: null,         // conversationId da sala em que estamos "inscritos"
  pc: null,                  // RTCPeerConnection ativa
  localStream: null,
  isVideoCall: false,
  isCaller: false,
  incomingOffer: null,
  pendingCandidates: [],
  muted: false,
  cameraOff: false,
 
  // NOVO: cronômetro da chamada (estilo WhatsApp)
  callStartTime: null,
  timerInterval: null,
};
 
/* ============================================================
   CANAL DE SINALIZAÇÃO
   PONTO DE INTEGRAÇÃO COM O BACK-END: troque este bloco por um
   WebSocket real (ex: new WebSocket("wss://seu-servidor")) quando
   o back-end estiver pronto. joinCallRoom() e sendSignal() são as
   únicas funções que o resto do arquivo usa — mantenha as mesmas
   assinaturas e nada mais precisa mudar.
   ============================================================ */
function joinCallRoom(conversationId) {
  if (!conversationId) return;
  if (callState.currentRoom === conversationId && callState.channel) return;
 
  if (callState.channel) callState.channel.close();
 
  callState.currentRoom = conversationId;
  callState.channel = new BroadcastChannel("vizin-call-" + conversationId);
  callState.channel.addEventListener("message", (event) => {
    handleSignalingMessage(event.data);
  });
}
 
function sendSignal(data) {
  if (!callState.channel) return;
  callState.channel.postMessage(data);
}
 
/* ============================================================
   TRATAR MENSAGENS DE SINALIZAÇÃO RECEBIDAS
   ============================================================ */
function handleSignalingMessage(msg) {
  switch (msg.type) {
    case "call-request": onIncomingCall(msg); break;
    case "offer": onReceiveOffer(msg); break;
    case "answer": onReceiveAnswer(msg); break;
    case "ice-candidate": onReceiveIceCandidate(msg); break;
    case "call-declined": endCall("O outro usuário recusou a chamada."); break;
    case "call-ended": endCall("A chamada foi encerrada."); break;
  }
}
 
function callOverlayVisible() {
  return !callEls.overlay.classList.contains("hidden");
}
 
/* ============================================================
   INICIAR CHAMADA (quem liga)
   ============================================================ */
async function startCall(isVideo) {
  const conv = state.conversations.find(c => c.id === state.activeConversationId);
  if (!conv) return;
 
  joinCallRoom(conv.id);
 
  callState.isVideoCall = isVideo;
  callState.isCaller = true;
 
  try {
    callState.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
  } catch (err) {
    console.error(err);
    showToast("Não foi possível acessar câmera/microfone.");
    return;
  }
 
  openCallOverlay(conv, "Chamando...");
 
  // NOVO: mostra o botão de cancelar enquanto espera o outro lado
  // atender. É escondido de novo em showActiveControls() (chamada
  // aceita) ou em endCall() (cancelada/recusada/encerrada).
  callEls.outgoingActions.classList.remove("hidden");
 
  attachLocalPreview();
 
  callState.pc = createPeerConnection();
  callState.localStream.getTracks().forEach(track => callState.pc.addTrack(track, callState.localStream));
 
  sendSignal({ type: "call-request", isVideo });
 
  const offer = await callState.pc.createOffer();
  await callState.pc.setLocalDescription(offer);
  sendSignal({ type: "offer", sdp: offer });
}
 
/* ============================================================
   RECEBER CHAMADA (quem atende)
   ============================================================ */
function onIncomingCall(msg) {
  if (callOverlayVisible()) {
    sendSignal({ type: "call-declined" });
    return;
  }
 
  const conv = state.conversations.find(c => c.id === callState.currentRoom);
  callState.isVideoCall = !!msg.isVideo;
  callState.isCaller = false;
 
  openCallOverlay(conv, msg.isVideo ? "Chamada de vídeo recebida" : "Chamada de voz recebida");
  callEls.incomingActions.classList.remove("hidden");
}
 
function onReceiveOffer(msg) {
  callState.incomingOffer = msg.sdp;
}
 
async function acceptIncomingCall() {
  callEls.incomingActions.classList.add("hidden");
  callEls.statusText.textContent = "Conectando...";
 
  try {
    callState.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callState.isVideoCall
    });
  } catch (err) {
    console.error(err);
    showToast("Não foi possível acessar câmera/microfone.");
    declineIncomingCall();
    return;
  }
 
  attachLocalPreview();
 
  callState.pc = createPeerConnection();
  callState.localStream.getTracks().forEach(track => callState.pc.addTrack(track, callState.localStream));
 
  if (callState.incomingOffer) {
    await callState.pc.setRemoteDescription(new RTCSessionDescription(callState.incomingOffer));
    await flushPendingCandidates();
    const answer = await callState.pc.createAnswer();
    await callState.pc.setLocalDescription(answer);
    sendSignal({ type: "answer", sdp: answer });
  }
 
  showActiveControls();
}
 
function declineIncomingCall() {
  sendSignal({ type: "call-declined" });
  endCall();
}
 
async function onReceiveAnswer(msg) {
  if (!callState.pc) return;
  await callState.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
  await flushPendingCandidates();
  showActiveControls();
}
 
async function onReceiveIceCandidate(msg) {
  if (!msg.candidate) return;
 
  if (!callState.pc || !callState.pc.remoteDescription) {
    callState.pendingCandidates.push(msg.candidate);
    return;
  }
 
  try {
    await callState.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
  } catch (err) {
    console.warn("Erro ao adicionar ICE candidate:", err);
  }
}
 
async function flushPendingCandidates() {
  for (const candidate of callState.pendingCandidates) {
    try {
      await callState.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn("Erro ao adicionar ICE candidate pendente:", err);
    }
  }
  callState.pendingCandidates = [];
}
 
/* ============================================================
   PEER CONNECTION (WebRTC) — permanece igual, independe de como
   a sinalização chega (BroadcastChannel hoje, WebSocket amanhã)
   ============================================================ */
function createPeerConnection() {
  const pc = new RTCPeerConnection(ICE_SERVERS);
 
  pc.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      sendSignal({ type: "ice-candidate", candidate: event.candidate });
    }
  });
 
  pc.addEventListener("track", (event) => {
    // Só troca pra tela cheia de vídeo (escondendo a foto) quando é
    // realmente uma VIDEOchamada. Numa chamada de voz esse evento
    // também dispara (é a track de ÁUDIO chegando), então antes isso
    // escondia a foto sem necessidade — corrigido aqui.
    if (callState.isVideoCall) {
      callEls.remoteVideo.srcObject = event.streams[0];
      callEls.remoteVideo.classList.remove("hidden");
      callEls.info.classList.add("hidden");
    }
  });
 
  pc.addEventListener("connectionstatechange", () => {
    // NOVO: assim que a conexão P2P é estabelecida de fato, começa
    // a contar o tempo — igual ao WhatsApp, que só cronometra a
    // partir do momento em que a chamada realmente conecta.
    if (pc.connectionState === "connected") {
      startCallTimer();
    }
    if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
      endCall();
    }
  });
 
  return pc;
}
 
/* ============================================================
   UI DA CHAMADA
   ============================================================ */
function openCallOverlay(conv, statusText) {
  callEls.overlay.classList.remove("hidden");
  callEls.info.classList.remove("hidden");
  callEls.remoteVideo.classList.add("hidden");
  callEls.localVideo.classList.add("hidden");
  callEls.incomingActions.classList.add("hidden");
  callEls.outgoingActions.classList.add("hidden"); // NOVO
  callEls.activeControls.classList.add("hidden");
  callEls.timerBadge.classList.add("hidden"); // NOVO: reseta visual do cronômetro
  callEls.avatar.src = conv?.user?.avatar || "";
  callEls.peerName.textContent = conv?.user?.name || "Contato";
  callEls.statusText.textContent = statusText;
}
 
function attachLocalPreview() {
  callEls.localVideo.srcObject = callState.localStream;
  if (callState.isVideoCall) {
    callEls.localVideo.classList.remove("hidden");
  }
}
 
function showActiveControls() {
  callEls.outgoingActions.classList.add("hidden"); // NOVO: chamada foi aceita, some o "cancelar"
  callEls.activeControls.classList.remove("hidden");
}
 
/* ============================================================
   CRONÔMETRO DA CHAMADA (estilo WhatsApp)
   Em chamada de voz o tempo aparece em #callStatusText, embaixo do
   nome (a foto continua visível). Em videochamada aparece no badge
   flutuante sobre o vídeo, já que #callInfo fica escondido.
   ============================================================ */
function formatCallDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = n => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
 
function updateCallTimerDisplay() {
  const elapsed = Math.floor((Date.now() - callState.callStartTime) / 1000);
  const text = formatCallDuration(elapsed);
 
  if (callState.isVideoCall) {
    callEls.timerBadge.textContent = text;
  } else {
    callEls.statusText.textContent = text;
  }
}
 
function startCallTimer() {
  if (callState.timerInterval) return; // já está rodando, evita duplicar
 
  callState.callStartTime = Date.now();
 
  if (callState.isVideoCall) {
    callEls.timerBadge.classList.remove("hidden");
  }
 
  updateCallTimerDisplay();
  callState.timerInterval = setInterval(updateCallTimerDisplay, 1000);
}
 
function stopCallTimer() {
  if (callState.timerInterval) {
    clearInterval(callState.timerInterval);
    callState.timerInterval = null;
  }
  callState.callStartTime = null;
  callEls.timerBadge.classList.add("hidden");
  callEls.timerBadge.textContent = "00:00";
}
 
function endCall(toastMsg) {
  stopCallTimer(); // NOVO: zera e para o cronômetro em qualquer encerramento
 
  if (callState.pc) {
    callState.pc.close();
    callState.pc = null;
  }
  if (callState.localStream) {
    callState.localStream.getTracks().forEach(t => t.stop());
    callState.localStream = null;
  }
 
  callEls.remoteVideo.srcObject = null;
  callEls.localVideo.srcObject = null;
  callEls.overlay.classList.add("hidden");
  callEls.incomingActions.classList.add("hidden");
  callEls.outgoingActions.classList.add("hidden"); // NOVO
  callEls.activeControls.classList.add("hidden");
 
  callState.incomingOffer = null;
  callState.pendingCandidates = [];
  callState.isCaller = false;
  callState.muted = false;
  callState.cameraOff = false;
 
  if (toastMsg) showToast(toastMsg);
}
 
function hangUp() {
  sendSignal({ type: "call-ended" });
  endCall();
}
 
// NOVO: cancelar uma ligação feita sem querer, enquanto ainda está
// no estado "Chamando..." (antes do outro lado aceitar). Reaproveita
// o mesmo sinal "call-ended" — do lado de quem recebeu, isso já cai
// no case "call-ended" de handleSignalingMessage() e fecha o overlay
// dele também, com o toast "A chamada foi encerrada.".
function cancelOutgoingCall() {
  sendSignal({ type: "call-ended" });
  endCall();
}
 
function toggleMute() {
  if (!callState.localStream) return;
  callState.muted = !callState.muted;
  callState.localStream.getAudioTracks().forEach(t => t.enabled = !callState.muted);
  callEls.muteBtn.classList.toggle("call-btn--active", callState.muted);
}
 
function toggleCamera() {
  if (!callState.localStream || !callState.isVideoCall) return;
  callState.cameraOff = !callState.cameraOff;
  callState.localStream.getVideoTracks().forEach(t => t.enabled = !callState.cameraOff);
  callEls.cameraBtn.classList.toggle("call-btn--active", callState.cameraOff);
}
 
/* ============================================================
   EVENTOS
   ============================================================ */
document.getElementById("callAudioBtn")?.addEventListener("click", () => startCall(false));
document.getElementById("callVideoBtn")?.addEventListener("click", () => startCall(true));
 
callEls.acceptBtn.addEventListener("click", acceptIncomingCall);
callEls.declineBtn.addEventListener("click", declineIncomingCall);
callEls.cancelBtn.addEventListener("click", cancelOutgoingCall); // NOVO
callEls.hangupBtn.addEventListener("click", hangUp);
callEls.muteBtn.addEventListener("click", toggleMute);
callEls.cameraBtn.addEventListener("click", toggleCamera);
 
window.addEventListener("beforeunload", () => {
  if (callOverlayVisible()) sendSignal({ type: "call-ended" });
});
 