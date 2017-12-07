'use strict';

class Ui{
  constructor(controller){
    this.controller        = controller;
    this.connectButton     = document.getElementById("connectButton");
    this.offerButton       = document.getElementById("offerButton");
    this.screenShareButton = document.getElementById("screenShareButton");
    this.disconnectButton  = document.getElementById("disconnectButton");
    this.sendButton        = document.getElementById("sendButton");
    this.messageInputBox   = document.getElementById("message");
    this.receiveBox        = document.getElementById("receivebox");
    this.screenShare       = document.querySelector(".screenShareVideo");
  }

  wireEvents(){
    this.connectButton    .addEventListener('click', e => this.controller.connectPeers(),        false);
    this.offerButton      .addEventListener('click', e => this.controller.initiateOffer(),       false);
    this.screenShareButton.addEventListener('click', e => this.controller.initiateScreenShare(), false);
    this.disconnectButton .addEventListener('click', e => this.controller.disconnectPeers(),     false);
    this.sendButton       .addEventListener('click', e => this.controller.sendMessage(),         false);
  }

  disconnected(){
    this.connectButton.disabled     = false;
    this.offerButton.disabled       = true;
    this.screenShareButton.disabled = true;
    this.disconnectButton.disabled  = true;
    this.messageInputBox.disabled   = true;
    this.sendButton.disabled        = true;
  }

  connecting(){
    this.connectButton.disabled     = true;
    this.offerButton.disabled       = true;
    this.screenShareButton.disabled = true;
    this.disconnectButton.disabled  = true;
    this.messageInputBox.disabled   = true;
    this.sendButton.disabled        = true;
  }

  connected(){
    this.connectButton.disabled     = true;
    this.offerButton.disabled       = true;
    this.screenShareButton.disabled = false;
    this.disconnectButton.disabled  = false;
    this.messageInputBox.disabled   = true;
    this.sendButton.disabled        = true;
  }

  established(){
    this.connectButton.disabled     = true;
    this.offerButton.disabled       = true;
    this.screenShareButton.disabled = false;
    this.disconnectButton.disabled  = false;
    this.messageInputBox.disabled   = false;
    this.messageInputBox.focus();
    this.sendButton.disabled        = false;
  }
}

class WebRtc{
  constructor(){
    this._connectionStatus;
    this._sendChannelStatus;
    this.ui         = new Ui(this);
    this.server     = new Server(this);
    this.connection = new Connection(this);
    this.connectionStatus = "disconnected";
    this.ui.wireEvents();
  }

  set connectionStatus(status){
    this._connectionStatus = status;
    switch(status){
      case "disconnected":
        this.ui.disconnected();
      break;
      case "connecting":
        this.ui.connecting();
      break;
      case "connected":
        this.ui.connected();
      break;
      case "established":
        this.ui.established();
      break;
    }
  }

  get connectionStatus(){
    return this._connectionStatus;
  }

  set sendChannelStatus(status){
    this._sendChannelStatus = status;
    switch(status){
      case "open":
        this.connectionStatus = "established";
      break;
      case "disconnected":
        this.connectionStatus = "disconnected";
      break;
      default:
        this.log(`status: ${status}`);
        this.connectionStatus = "connected";
      break;
    }
  }

  get sendChannelStatus(){
    return this._sendChannelStatus;
  }

  appendMessage(message){
    let el       = document.createElement("p");
    let textNode = document.createTextNode(message);
    el.appendChild(textNode);
    this.ui.receiveBox.appendChild(el);
  }
  log(message){
      console.log(message);
  }
  trace(message){
    console.log(message);//firefox does not output message
    console.trace(message);
  }
  //Handle Connection Stuff
  connectPeers(){
    this.connection.connectPeers();
    this.connectionStatus = "connected";
  }
  disconnectPeers(){
    this.connection.disconnectPeers();
    this.connectionStatus         = "disconnected";
    this.ui.messageInputBox.value = "";
  }
  //Handle Message Stuff
  sendMessage(){
    let message = this.ui.messageInputBox.value;
    this.connection.sendMessage(message);
    this.ui.messageInputBox.value = "";
    this.ui.messageInputBox.focus();
  }
  initiateOffer(){
    this.connection.initiateOffer();
  }
  sendOffer(offer){
    this.server.sendOffer(offer);
  }
  doOffer(offer){
    this.connection.doOffer(offer);
  }
  sendAnswer(answer){
    this.server.sendAnswer(answer);
  }
  doAnswer(answer){
    this.connection.doAnswer(answer);
  }
  initiateScreenShare(){
    this.connection.initiateScreenShare();
  }
  addStream(stream){
    this.log("ENTER addStream");
    this.log(stream);
    //this.ui.screenShare.src       = window.URL.createObjectURL(stream);
    this.ui.screenShare.srcObject = stream;
    this.ui.screenShare.autoplay  = true;
    this.log("EXIT addStream");
  }
}

class Server{
  constructor(controller){
    this.eventUrl    = "/ws/event";
    this.controller  = controller;
    let secure = document.location.protocol === "https:";
    let host   = document.location.hostname;
    let port   = document.location.port;
    if("" !== port){
      port = `:${port}`;
    }
    this.socket           = new WebSocket(`${secure ? "wss" : "ws"}://${host}${port}${this.eventUrl}`);/* global WebSocket */
    this.socket.onopen    = e => this.onOpen(e);
    this.socket.onmessage = e => this.onMessage(e);
    this.socket.onerror   = e => this.controller.trace(e);
  }

  onOpen(event){
    this.controller.log("Connecting");
    this.controller.log(event);
  }

  onMessage(event){
    this.controller.log("Message: ");
  	this.controller.log(event);
    let json = JSON.parse(event.data);
    if(json.type === "offer"){
      this.controller.doOffer(json);
    } else if(json.type === "answer"){
      this.controller.doAnswer(json);
    }
  }

  sendOffer(offer){
    this.socket.send(JSON.stringify(offer));
  }

  sendAnswer(offer){
    this.socket.send(JSON.stringify(offer));
  }
}

class Connection{
  constructor(controller){
    this.controller      = controller;
    this.localConnection = null;
    this.sendChannel     = null;
    this.role            = "";//offerer/answerer
  }

  connectPeers() {
    this.controller.log("ENTER connectPeers");
    let config = {"iceServers":[{"urls":"stun:stun.l.google.com:19302"}]};
    this.localConnection = new RTCPeerConnection(config); /*global RTCPeerConnection*/
    this.localConnection.onicecandidate             = e => this.handleAddCandidate(e);
    this.localConnection.onicegatheringstatechange  = e => this.handleStateChange(e);
    this.localConnection.oniceconnectionstatechange = e => this.handleStateChange(e);
    this.localConnection.onsignalingstatechange     = e => this.handleStateChange(e);
    this.localConnection.onnegotiationneeded        = e => this.handleNegotiationNeeded(e);
    this.localConnection.onaddstream                = s => this.handleTrackEvent(s);
    /*this.sendChannel                                = this.localConnection.createDataChannel("sendChannel");
    this.localConnection.ondatachannel              = e => this.onSendChannelConnect(e);
    this.sendChannel.onopen                         = e => this.handleSendChannelStatusChange(e);
    this.sendChannel.onclose                        = e => this.handleSendChannelStatusChange(e);
    this.sendChannel.onmessage                      = m => this.onSendChannelMessage(m);*/
    this.controller.log("EXIT connectPeers");
  }

  handleNegotiationNeeded(event){
    this.controller.log("ENTER handleNegotiationNeeded");
    this.controller.log(this.localConnection.signalingState);
    this.localConnection.createOffer()
    .then(offer => this.localConnection.setLocalDescription(offer))
    .then(()    => this.controller.sendOffer(this.localConnection.localDescription))
    .catch(e    => this.controller.trace(e));
    this.controller.log("EXIT handleNegotiationNeeded");
  }

  doOffer(offer){
    this.controller.log(this.localConnection);
    this.connectPeers();
    this.localConnection.setRemoteDescription(new RTCSessionDescription(offer))
    .then(_ => this.controller.log("set offer"))
    .then(_ => this.doScreenShare())
    .then(_ => this.localConnection.createAnswer())
    .then(answer => this.localConnection.setLocalDescription(answer))
    .then(_ => this.controller.sendAnswer(this.localConnection.localDescription))
    .catch(e => this.controller.trace(e));
  }

  doAnswer(answer){
    this.controller.log(this.localConnection);
    this.localConnection.setRemoteDescription(new RTCSessionDescription(answer))
    .then(_ => this.controller.log("set answer"))
    .catch(e => this.controller.trace(e));
  }

  initiateScreenShare(){
    return this.doScreenShare();
  }

  doScreenShare(){
    return navigator.mediaDevices.getUserMedia({"video":{"mandatory":{"chromeMediaSource":"screen"}}})
    .then(stream => {
      this.controller.log(stream);
      return stream;
    })
    .then(stream => this.localConnection.addStream(stream))
    .catch(e => this.controller.trace(e));
  }

  handleTrackEvent(event){
    this.controller.log("ENTER handleTrackEvent");
    this.controller.log(event);
    this.controller.addStream(event.stream);
    this.controller.log("EXIT handleTrackEvent");
  }

  handleAddCandidate(candidate){
    if(null != this.localConnection.remoteDescription && this.localConnection.remoteDescription.type && candidate.candidate){
      //this.controller.log("ENTER handleAddCandidate");
      this.controller.log(candidate.candidate);
      this.localConnection.addIceCandidate(candidate.candidate)
      .catch(e => this.controller.trace(e));
      //this.controller.log("EXIT handleAddCandidate");
    }
  }

  handleStateChange(event){
    //this.controller.log("ENTER handleStateChange");
    //this.controller.log(`iceConnectionState: ${event.target.iceConnectionState}; iceGatheringState: ${event.target.iceGatheringState}; signalingState: ${event.target.signalingState}`);
    //this.controller.log("EXIT handleStateChange");
  }

  disconnectPeers() {
    //this.controller.log("ENTER disconnectPeers");
    if(this.sendChannel !== null)     this.sendChannel.close();
    if(this.receiveChannel !== null)  this.receiveChannel.close();
    if(this.localConnection !== null) this.localConnection.close();
    this.sendChannel                 = null;
    this.localConnection             = null;
    this.controller.connectionStatus = "disconnected";
    //this.controller.log("EXIT disconnectPeers");
  }

  handleSendChannelStatusChange(event){
    //this.controller.log("ENTER handleSendChannelStatusChange");
    //this.controller.log(event);
    if (this.sendChannel) {
      this.controller.sendChannelStatus = this.sendChannel.readyState;
    } else {
      this.controller.sendChannelStatus = "disconnected";
    }
    //this.controller.log("EXIT handleSendChannelStatusChange");
  }

  onSendChannelConnect(e){
    this.sendChannel           = e.channel;
    this.sendChannel.onopen    = e => this.handleSendChannelStatusChange(e);
    this.sendChannel.onclose   = e => this.handleSendChannelStatusChange(e);
    this.sendChannel.onmessage = m => this.onSendChannelMessage(m);
  }

  onSendChannelMessage(event){
    //this.controller.log("ENTER onSendChannelMessage");
    //this.controller.log(event);
    this.controller.appendMessage(event.data);
    //this.controller.log("EXIT onSendChannelMessage");
  }

  sendMessage(message){
    this.controller.appendMessage(message);
    this.sendChannel.send(message);
  }

  handleReceiveMessage(event){
  }
}

window.addEventListener('load', () => new WebRtc(), false);
