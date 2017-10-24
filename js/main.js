'use strict';

class Ui{
    constructor(){
        this.connectButton    = document.getElementById('connectButton');
        this.offerButton      = document.getElementById('offerButton');
        this.disconnectButton = document.getElementById('disconnectButton');
        this.sendButton       = document.getElementById('sendButton');
        this.messageInputBox  = document.getElementById('message');
        this.receiveBox       = document.getElementById('receivebox');
    }
}

class WebRtc{
    constructor(){
        this.ui         = new Ui();
        this.server     = new Server(this);
        this.connection = new Connection(this);

        this.ui.connectButton   .addEventListener('click', e => this.connectPeers(),    false);
        this.ui.offerButton     .addEventListener('click', e => this.initiateOffer(),    false);
        this.ui.disconnectButton.addEventListener('click', e => this.disconnectPeers(), false);
        this.ui.sendButton      .addEventListener('click', e => this.sendMessage(),     false);
        this.connectionStatus("disconnected");
    }

    //Controller Stuff
    connectionStatus(status){
        switch(status){
            case "disconnected":
                this.ui.connectButton.disabled    = false;
                this.ui.offerButton.disabled      = true;
                this.ui.disconnectButton.disabled = true;
                this.ui.sendButton.disabled       = true;
                break;
            case "connecting":
                this.ui.connectButton.disabled    = true;
                this.ui.offerButton.disabled      = true;
                this.ui.disconnectButton.disabled = true;
                this.ui.sendButton.disabled       = true;
                break;
            case "connected":
                this.ui.connectButton.disabled    = true;
                this.ui.offerButton.disabled      = false;
                this.ui.disconnectButton.disabled = false;
                this.ui.sendButton.disabled       = false;
                break;
        }
    }

    sendChannelStatus(status){
        switch(status){
            case "open":
                this.ui.messageInputBox.disabled  = false;
                this.ui.messageInputBox.focus();
                this.ui.sendButton.disabled       = false;
                this.ui.disconnectButton.disabled = false;
                this.ui.connectButton.disabled    = true;
                break;
            default:
                this.ui.messageInputBox.disabled  = true;
                this.ui.sendButton.disabled       = true;
                this.ui.connectButton.disabled    = false;
                this.ui.disconnectButton.disabled = true;
                break;
        }
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
      //this.connectionStatus("connecting");
      this.connection.connectPeers();
      this.connectionStatus("connected");
    }
    disconnectPeers(){
        this.connection.disconnectPeers();
        this.connectionStatus("disconnected");
        this.ui.messageInputBox.value     = "";
        this.ui.messageInputBox.disabled  = true;
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
}

class Server{
    constructor(controller){
        this.eventUrl    = "/ws/event";
        this.controller  = controller;
        let secure = document.location.protocol === "https:";
        let host   = document.location.hostname;
        this.socket           = new WebSocket(`${secure ? "wss" : "ws"}://${host}:8080${this.eventUrl}`);/* global WebSocket */
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
      this.controller       = controller;
      this.localConnection  = null;
      this.sendChannel      = null;
      this.remoteConnection = null;
      this.receiveChannel   = null;
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
      this.localConnection.ontrack                    = e => this.handleTrackEvent(e);
      this.sendChannel                                = this.localConnection.createDataChannel("sendChannel");
      this.sendChannel.onopen                         = e => this.handleSendChannelStatusChange(e);
      this.sendChannel.onclose                        = e => this.handleSendChannelStatusChange(e);
      this.receiveChannel                             = null;
      this.controller.log("EXIT connectPeers");
    }

    initiateOffer(){
      this.controller.log("ENTER initiateOffer");
      this.localConnection.createOffer()
      .then(offer => this.localConnection.setLocalDescription(offer))
      .then(()    => this.controller.sendOffer(this.localConnection.localDescription))
      .catch(e    => this.handleCreateDescriptionError(e));
      this.controller.log("EXIT initiateOffer");
    }

    doOffer(offer){
      this.localConnection.setRemoteDescription(new RTCSessionDescription(offer))
      .then(_ => this.controller.log("set offer"))
      .then(_ => this.localConnection.createAnswer())
      .then(answer => this.localConnection.setLocalDescription(answer))
      .then(_ => this.controller.sendAnswer(this.localConnection.localDescription))
      .catch(e => this.controller.trace(e));
    }

    doAnswer(answer){
      this.localConnection.setRemoteDescription(new RTCSessionDescription(answer))
      .then(_ => this.controller.log("set answer"))
      .catch(e => this.controller.trace(e));
    }

    handleAddCandidate(candidate){
        if(null != this.localConnection.remoteDescription && this.localConnection.remoteDescription.type && candidate.candidate){
            this.controller.log("ENTER handleAddCandidate");
            this.controller.log(candidate.candidate);
            this.localConnection.addIceCandidate(candidate.candidate)
            .catch(e => this.handleAddCandidateError(e));
            this.controller.log("EXIT handleAddCandidate");
        }
    }

    handleAddCandidateError(error) {
        this.controller.trace(error);
    }

    handleStateChange(event){
        this.controller.log("ENTER handleStateChange");
        //this.controller.log(`iceConnectionState: ${event.target.iceConnectionState}; iceGatheringState: ${event.target.iceGatheringState}; signalingState: ${event.target.signalingState}`);
        this.controller.log("EXIT handleStateChange");
    }

    handleNegotiationNeeded(event){
        this.controller.log("ENTER handleNegotiationNeeded");
        //this.controller.log(event);
        this.controller.log("EXIT handleNegotiationNeeded");
    }

    disconnectPeers() {
        this.controller.log("ENTER disconnectPeers");
        // Close the RTCDataChannels if they're open.
        if(this.sendChannel !== null) this.sendChannel.close();
        if(this.receiveChannel !== null) this.receiveChannel.close();
        // Close the RTCPeerConnections
        this.localConnection.close();
        this.sendChannel      = null;
        this.receiveChannel   = null;
        this.localConnection  = null;
        this.controller.log("EXIT disconnectPeers");
    }

    handleSendChannelStatusChange(event){
        this.controller.log("ENTER handleSendChannelStatusChange");
        //this.controller.log(event);
        if (this.sendChannel) {
            this.controller.sendChannelStatus = this.sendChannel.readyState;
        } else {
            this.controller.sendChannelStatus = "disconnected";
        }
        this.controller.log("EXIT handleSendChannelStatusChange");
    }

    receiveChannelCallback(event){
        this.controller.log("ENTER receiveChannelCallback");
        //this.controller.log(event);
        this.receiveChannel           = event.channel;
        this.receiveChannel.onmessage = (e) => this.handleReceiveMessage(e);
        this.receiveChannel.onopen    = (e) => this.handleReceiveChannelStatusChange(e);
        this.receiveChannel.onclose   = (e) => this.handleReceiveChannelStatusChange(e);
        this.controller.log("EXIT receiveChannelCallback");
    }

    sendMessage(message){
        this.sendChannel.send(message);
    }

    handleReceiveMessage(event){
        this.controller.log("ENTER handleReceiveMessage");
        //this.controller.log(event);
        this.controller.appendMessage(event.data);
        this.controller.log("EXIT handleReceiveMessage");
    }

    handleReceiveChannelStatusChange(event){
        this.controller.log("ENTER handleReceiveChannelStatusChange");
        //this.controller.log(event);
        if(this.receiveChannel){
            this.controller.log("receiveChannel status has changed to " + this.receiveChannel.readyState);
        }
        this.controller.log("EXIT handleReceiveChannelStatusChange");
    }

    handleCreateDescriptionError(error){
        this.controller.trace("Unable to create an offer: " + error.toString());
    }

    handleTrackEvent(event){
        this.controller.log("ENTER handleTrackEvent");
        //this.controller.log(event);
        this.controller.log("EXIT handleTrackEvent");
    }
}

window.addEventListener('load', () => new WebRtc(), false);
