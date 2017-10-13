'use strict';

class WebRtc{
    constructor(){
        this.ui         = new Ui();
        this.server     = new Server();
        this.connection = new Connection(this);
        
        this.ui.connectButton   .addEventListener('click', (e) => this.connectPeers(),    false);
        this.ui.disconnectButton.addEventListener('click', (e) => this.disconnectPeers(), false);
        this.ui.sendButton      .addEventListener('click', (e) => this.sendMessage(),     false);
    }
    
    //Controller Stuff
    set connectionStatus(status){
        switch(status){
            case "disconnected":
                break;
            case "connecting":
                this.ui.connectButton.disabled = true;
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
        //console.trace(message);
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
    
    sendOffer(descriptor){
        this.log("ENTER sendDescriptor");
        this.log(descriptor);
        return this.server.sendOffer(descriptor);
    }
    
    sendAnswer(){}
}

class Server{
    constructor(){
        this.url = "/descriptor";
    }
    
    sendOffer(offer){
        return fetch(this.url, {
            "method":"post"
            , "headers": {
                "Content-type": "application/json"
            }
            , "body": JSON.stringify(offer)
        })/*global fetch*/
        .then(response => response.json())
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
        this.localConnection.onicecandidate             = (e) => this.handleIceCandidate(e);
        this.localConnection.oniceconnectionstatechange = (e) => this.handleIceConnectionStateChange(e);
        this.localConnection.ontrack                    = (e) => this.handleTrackEvent(e);
        
        this.sendChannel                                = this.localConnection.createDataChannel("sendChannel");
        this.sendChannel.onopen                         = (e) => this.handleSendChannelStatusChange(e);
        this.sendChannel.onclose                        = (e) => this.handleSendChannelStatusChange(e);
        
        this.receiveChannel                             = null;
        
        this.localConnection.onicecandidate             = e => this.handleAddCandidate(e);
        
        /**
         * we need to send an offer to the server than another client needs to get the offer and send an answer back to the server than the original client can accept the offer
         **/
        let offer = this.controller.getOffer();
        
        if("" !== offer){
            this.controller.log(offer);
            this.localConnection.setRemoteDescription(offer)
            .then(() => this.localConnection.createAnswer())
            .then(answer => this.localConnection.setLocalDescription(answer))
            .then(() => this.controller.sendAnswer(this.localConnection.localDescription))
            .catch(e => this.handleCreateDescriptionError(e));
        } else {
            // Now create an offer to connect; this starts the process
            this.localConnection.createOffer()
            .then(offer => this.localConnection.setLocalDescription(offer))
            .then(() => this.controller.sendOffer(this.localConnection.localDescription))
            .then(answer => this.localConnection.setRemoteDescription(answer))
            .catch(e => this.handleCreateDescriptionError(e));
        }
        
        this.controller.log("EXIT connectPeers");
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
        this.controller.log("Unable to create an offer: " + error.toString());
    }
    
    handleAddCandidate(candidate){
        if(candidate.candidate){
            this.localConnection.addIceCandidate(candidate.candidate)
            .catch(e => this.handleAddCandidateError(e));
        }
    }
    
    handleAddCandidateError(error) {
        this.controller.log("ENTER handleAddCandidateError");
        this.controller.log(error);
        this.controller.log("EXIT handleAddCandidateError");
    }
    
    handleIceCandidate(event){
        this.controller.log("ENTER handleIceCandidate");
        this.controller.log(event);
        this.controller.log("EXIT handleIceCandidate");
    }
    
    handleIceConnectionStateChange(event){
        this.controller.log(`Ice Connection State Changed to ${this.localConnection.iceConnectionState}`);
    }
    
    handleTrackEvent(event){
        this.controller.log("ENTER handleTrackEvent");
        this.controller.log(event);
        this.controller.log("EXIT handleTrackEvent");
    }
    
    sendMessage(message){
        this.sendChannel.send(message);
    }
}

window.addEventListener('load', () => new WebRtc(), false);