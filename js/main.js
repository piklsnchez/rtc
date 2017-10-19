'use strict';

class WebRtc{
    constructor(){
        this.ui         = new Ui();
        this.server     = new Server(this);
        this.connection = new Connection(this);
        
        this.ui.connectButton   .addEventListener('click', e => this.connectPeers(),    false);
        this.ui.disconnectButton.addEventListener('click', e => this.disconnectPeers(), false);
        this.ui.sendButton      .addEventListener('click', e => this.sendMessage(),     false);
    }
    
    //Controller Stuff
    set connectionStatus(status){
        switch(status){
            case "disconnected":
                break;
            case "connecting":
                this.ui.connectButton.disabled    = true;
                break;
            case "connected":
                this.ui.disconnectButton.disabled = false;
                break;
        }
    }
    
    set sendChannelStatus(status){
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
        console.trace(message);
    }
    
    //Handle Connection Stuff
    connectPeers(){
        this.connection.connectPeers();
    }
    
    disconnectPeers(){
        this.connection.disconnectPeers();
        
        // Update user interface elements
        this.ui.connectButton.disabled    = false;
        this.ui.disconnectButton.disabled = true;
        this.ui.sendButton.disabled       = true;
        
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
    
    getOffer(){
        return this.server.getOffer()
        .then(json => {this.log(json); return json;});
    }
    
    sendOffer(offer){
        this.log("ENTER sendOffer");
        this.log(offer);
        return this.server.sendOffer(offer);
        //.then(answer => {this.log("answer"); this.log(answer); return answer;});
    }
    
    sendAnswer(answer){
        this.log("ENTER sendAnswer");
        this.log(answer);
        return this.server.sendAnswer(answer);
    }
}

class Server{
    constructor(controller){
        this.offerUrl    = "/rest/offer";
        this.answerUrl   = "/rest/answer";
        this.eventUrl    = "/rest/event";
        this.controller  = controller;
        this.eventSource = new EventSource(this.eventUrl);/* global EventSource */
        this.eventSource.onmessage = e => this.onEvent(e);
    }
    
    onEvent(event){
        this.controller.log(event);
    }
    
    getOffer(){
        return fetch(this.offerUrl, {
            "method":"get"
            , "headers": {
                "Content-type": "application/json"
            }
        })/*global fetch*/
        .then(response => response.json())
        .catch("ERROR");
    }
    
    sendOffer(offer){
        return fetch(this.offerUrl, {
            "method":"post"
            , "headers": {
                "Content-type": "application/json"
            }
            , "body": JSON.stringify(offer)
        })
        //.then(response => response.json())
        .catch("ERROR");
    }
    
    getAnswer(){
        return fetch(this.answerUrl, {
            "method":"get"
            , "headers": {
                "Content-type": "application/json"
            }
        })/*global fetch*/
        .then(response => response.json())
        .catch("ERROR");
    }
    
    sendAnswer(offer){
        return fetch(this.answerUrl, {
            "method":"post"
            , "headers": {
                "Content-type": "application/json"
            }
            , "body": JSON.stringify(offer)
        })
        .catch("ERROR");
    }
}

class Ui{
    constructor(){
        this.connectButton    = document.getElementById('connectButton');
        this.disconnectButton = document.getElementById('disconnectButton');
        this.sendButton       = document.getElementById('sendButton');
        this.messageInputBox  = document.getElementById('message');
        this.receiveBox       = document.getElementById('receivebox');
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
        this.localConnection                            = new RTCPeerConnection(config); /*global RTCPeerConnection*/
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
        
        
        
        //we need to send an offer to the server than another client needs to get the offer and send an answer back to the server than the original client can accept the offer
        /*this.controller.getOffer()
        .then(offer => {
            if(!offer.sdp){
                //Create an offer to connect; this starts the process
                this.localConnection.createOffer()
                .then(offer  => this.localConnection.setLocalDescription(offer))
                .then(()     => this.controller.sendOffer(this.localConnection.localDescription))//this blocks until there is an answer
                .then(answer => this.localConnection.setRemoteDescription(answer))
                .catch(e     => this.handleCreateDescriptionError(e));
            } else {
                //this is called after there is an offer
                this.localConnection.setRemoteDescription(offer)
                .then(()     => this.localConnection.createAnswer())
                .then(answer => this.localConnection.setLocalDescription(answer))
                .then(()     => this.controller.sendAnswer(this.localConnection.localDescription))
                .catch(e     => this.handleCreateDescriptionError(e));
            }
        });*/
        
        this.controller.log("EXIT connectPeers");
    }
    
    handleAddCandidate(candidate){
        this.controller.log("ENTER handleAddCandidate");
        this.controller.log(candidate);
        if(this.localConnection.remoteDescription.type && candidate.candidate){
            this.controller.log(candidate.candidate);
            this.localConnection.addIceCandidate(candidate.candidate)
            .catch(e => this.handleAddCandidateError(e));
        }
        this.controller.log("EXIT handleAddCandidate");
    }
    
    handleAddCandidateError(error) {
        this.controller.trace(error);
    }
    
    handleStateChange(event){
        this.controller.log("ENTER handleIceGatheringStateChange");
        this.controller.log(`iceConnectionState: ${event.target.iceConnectionState}; iceGatheringState: ${event.target.iceGatheringState}; signalingState: ${event.target.signalingState}`);
        this.controller.log("EXIT handleIceGatheringStateChange");
    }
    
    handleNegotiationNeeded(event){
        this.controller.log("ENTER handleNegotiationNeeded");
        this.controller.log(event);
        //Create an offer to connect; this starts the process
        this.localConnection.createOffer()
        .then(offer => this.localConnection.setLocalDescription(offer))
        .then(()    => this.controller.sendOffer(this.localConnection.localDescription))
        .catch(e    => this.handleCreateDescriptionError(e));
        this.controller.log("EXIT handleNegotiationNeeded");
    }
    
    disconnectPeers() {
        this.controller.log("ENTER disconnectPeers");
        // Close the RTCDataChannels if they're open.
        this.sendChannel.close();
        this.receiveChannel.close();
        // Close the RTCPeerConnections
        this.localConnection.close();
        this.sendChannel      = null;
        this.receiveChannel   = null;
        this.localConnection  = null;
        this.controller.log("EXIT disconnectPeers");
    }
    
    handleSendChannelStatusChange(event){
        this.controller.log("ENTER handleSendChannelStatusChange");
        this.controller.log(event);
        if (this.sendChannel) {
            this.controller.sendChannelStatus = this.sendChannel.readyState;
        } else {
            this.controller.sendChannelStatus = "disconnected";
        }
        this.controller.log("EXIT handleSendChannelStatusChange");
    }
    
    receiveChannelCallback(event){
        this.controller.log("ENTER receiveChannelCallback");
        this.controller.log(event);
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
        this.controller.log(event);
        this.controller.appendMessage(event.data);
        this.controller.log("EXIT handleReceiveMessage");
    }
    
    handleReceiveChannelStatusChange(event){
        this.controller.log("ENTER handleReceiveChannelStatusChange");
        this.controller.log(event);
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
        this.controller.log(event);
        this.controller.log("EXIT handleTrackEvent");
    }
}

window.addEventListener('load', () => new WebRtc(), false);