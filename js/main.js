'use strict';

class WebRtc{
    constructor(){
        this.ui = new Ui();
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
        this.controller          = controller;
        this.localConnection     = null;
        this.sendChannel         = null;
        this.remoteConnection    = null;
        this.receiveChannel      = null;
    }
    
    connectPeers() {
        this.controller.log("ENTER connectPeers");
        
        let config = {'iceServers':[{'urls':'stun:stun.l.google.com:19302'}]};
        this.localConnection                 = new RTCPeerConnection(config);
        this.localConnection.onicecandidate  = (e) => this.handleIceCandidate(e);
        this.localConnection.oniceconnectionstatechange = (e) => this.handleIceConnectionStateChange(e);
        this.localConnection.onaddstream     = (e) => this.handleAddStream(e);
        
        this.sendChannel                     = this.localConnection.createDataChannel("sendChannel");
        this.sendChannel.onopen              = (e) => this.handleSendChannelStatusChange(e);
        this.sendChannel.onclose             = (e) => this.handleSendChannelStatusChange(e);
        
        this.remoteConnection                = new RTCPeerConnection(config);
        this.receiveChannel                  = null;
        this.remoteConnection.ondatachannel  = (e) => this.receiveChannelCallback(e);
        
        this.localConnection.onicecandidate  = e => !e.candidate || this.remoteConnection.addIceCandidate(e.candidate)
        .catch(this.handleAddCandidateError);
    
        this.remoteConnection.onicecandidate = e => !e.candidate || this.localConnection.addIceCandidate(e.candidate)
        .catch(this.handleAddCandidateError);
        
        // Now create an offer to connect; this starts the process
        this.localConnection.createOffer()
        .then(offer  => {
            this.controller.log("offer");
            this.controller.log(offer);
            this.localConnection.setLocalDescription(offer);
        })
        .then(()     => this.remoteConnection.setRemoteDescription(this.localConnection.localDescription))//set with remote ends details?
        .then(()     => this.remoteConnection.createAnswer())
        .then(answer => {
            this.controller.log("answer");
            this.controller.log(answer);
            this.remoteConnection.setLocalDescription(answer);//set with local
        })
        .then(()     => this.localConnection.setRemoteDescription(this.remoteConnection.localDescription))
        .catch(this.handleCreateDescriptionError);
        
        this.controller.log("EXIT connectPeers");
    }
    
    disconnectPeers() {
        this.controller.log("ENTER disconnectPeers");
        
        // Close the RTCDataChannels if they're open.
        this.sendChannel.close();
        this.receiveChannel.close();
        
        // Close the RTCPeerConnections
        this.localConnection.close();
        this.remoteConnection.close();
    
        this.sendChannel      = null;
        this.receiveChannel   = null;
        this.localConnection  = null;
        this.remoteConnection = null;
        
        this.controller.log("EXIT disconnectPeers");
    }
    
    handleSendChannelStatusChange(event){
        this.controller.log("ENTER handleSendChannelStatusChange " + event);
        
        if (this.sendChannel) {
            this.controller.sendChannelStatus = this.sendChannel.readyState;
        } else {
            this.controller.sendChannelStatus = "disconnected";
        }
        
        this.controller.log("EXIT handleSendChannelStatusChange");
    }
    
    receiveChannelCallback(event){
        this.controller.log("ENTER receiveChannelCallback " + event);
        
        this.receiveChannel           = event.channel;
        this.receiveChannel.onmessage = (e) => this.handleReceiveMessage(e);
        this.receiveChannel.onopen    = (e) => this.handleReceiveChannelStatusChange(e);
        this.receiveChannel.onclose   = (e) => this.handleReceiveChannelStatusChange(e);
        
        this.controller.log("EXIT receiveChannelCallback");
    }
    
    handleReceiveMessage(event){
        this.controller.log("ENTER handleReceiveMessage " + event);
        
        this.controller.appendMessage(event.data);
        
        this.controller.log("EXIT handleReceiveMessage");
    }
    
    handleReceiveChannelStatusChange(event){
        this.controller.log("ENTER handleReceiveChannelStatusChange " + event);
        
        if(this.receiveChannel){
            this.controller.log("receiveChannel status has changed to " + this.receiveChannel.readyState);
        }
        
        this.controller.log("EXIT handleReceiveChannelStatusChange");
    }
    
    handleCreateDescriptionError(error){
        this.controller.log("Unable to create an offer: " + error.toString());
    }
    
    handleLocalAddCandidateSuccess() {
        this.controller.log("ENTER handleLocalAddCandidateSuccess");
        
        this.controller.setConnectionStatus("connecting");
        
        this.controller.log("EXIT handleLocalAddCandidateSuccess");
    }
    
    handleRemoteAddCandidateSuccess() {
        this.controller.log("ENTER handleRemoteAddCandidateSuccess");
        
        this.controller.setConnectionStatus("connected");
        
        this.controller.log("EXIT handleRemoteAddCandidateSuccess");
    }
    
    handleAddCandidateError() {
        this.controller.log("addICECandidate failed!");
    }
    
    handleIceCandidate(event){
        this.controller.log("ENTER handleIceCandidate " + event);
        this.controller.log(event);
        this.controller.log("EXIT handleIceCandidate");
    }
    
    handleIceConnectionStateChange(event){
        this.controller.log("Ice Connection State Changed to " + this.localConnection.iceConnectionState);
        this.controller.log(event);
    }
    
    handleAddStream(event){
        this.controller.log("add stream: " + event);
    }
    
    sendMessage(message){
        this.sendChannel.send(message);
    }
}

window.addEventListener('load', ()=> new WebRtc(), false);