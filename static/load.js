var configParams = new URLSearchParams(window.location.search);
var context = {
username: configParams.get('u') || ('user' + parseInt(Math.random() * 100000)),
roomId: configParams.get('r'),
token: null,
eventSource: null,
peers: {},
channels: {}
};
document.getElementById('username-display').innerText='Hey, '+context.username
history.replaceState({},'MeetNSketch',configParams.get('r'))
const rtcConfig = {
iceServers: [{
urls: [
'stun:stun.l.google.com:19302',
'stun:global.stun.twilio.com:3478'
]
}]
};

async function getToken() {
let res = await fetch('/access', {
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({
username: context.username
})
});
let data = await res.json();
context.token = data.token;
}

async function join() {
return fetch(`/${context.roomId}/join`, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': `Bearer ${context.token}`
}
});
}

async function connect() {
await getToken();
context.eventSource = new EventSource(`/connect?token=${context.token}`);
context.eventSource.addEventListener('add-peer', addPeer, false);
context.eventSource.addEventListener('remove-peer', removePeer, false);
context.eventSource.addEventListener('session-description', sessionDescription, false);
context.eventSource.addEventListener('ice-candidate', iceCandidate, false);
context.eventSource.addEventListener('connected', (user) => {
context.user = user;
join();
});
}
/**
 * @param  {} data
 */
function addPeer(data) {
let message = JSON.parse(data.data);
if (context.peers[message.peer.id]) {
return;
}
// setup peer connection
let peer = new RTCPeerConnection(rtcConfig);
context.peers[message.peer.id] = peer;
// handle ice candidate
/**
* @param  {} event
*/
peer.onicecandidate = function (event) {
if (event.candidate) {
relay(message.peer.id, 'ice-candidate', event.candidate);
}
};
// generate offer if required (on join, this peer will create an offer
// to every other peer in the network, thus forming a mesh)
if (message.offer) {
// create the data channel, map peer updates
let channel = peer.createDataChannel('updates');
channel.onmessage = function (event) {
onPeerData(message.peer.id, event.data);
};
context.channels[message.peer.id] = channel;
createOffer(message.peer.id, peer);
} else {
peer.ondatachannel = function (event) {
context.channels[message.peer.id] = event.channel;
event.channel.onmessage = function (evt) {
onPeerData(message.peer.id, evt.data);
};
};
}
}
/**
 * @param  {} peerId
 * @param  {} peer
 */
async function createOffer(peerId, peer) {
let offer = await peer.createOffer();
await peer.setLocalDescription(offer);
await relay(peerId, 'session-description', offer);
}
/**
 * @param  {} peerId
 * @param  {} event
 * @param  {} data
 */
function relay(peerId, event, data) {
fetch(`/relay/${peerId}/${event}`, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': `Bearer ${context.token}`
},
body: JSON.stringify(data)
});
}
/**
 * @param  {} peerId
 * @param  {} data
 */
function peerDataUpdates(peerId, data) {
onPeerData(peerId, data.data);
}
/**
 * @param  {} data
 */
function broadcast(data) {
for (let peerId in context.channels) {
if (context.channels[peerId].readyState === 'open') {
context.channels[peerId].send(data);
}
}
}
/**
 * @param  {} data
 */
function removePeer(data) {
let message = JSON.parse(data.data);
if (context.peers[message.peer.id]) {
context.peers[message.peer.id].close();
}
delete context.peers[message.peer.id];
}
/**
 * @param  {} data
 */
async function sessionDescription(data) {
let message = JSON.parse(data.data);
let peer = context.peers[message.peer.id];
let remoteDescription = new RTCSessionDescription(message.data);
await peer.setRemoteDescription(remoteDescription);
if (remoteDescription.type === 'offer') {
let answer = await peer.createAnswer();
await peer.setLocalDescription(answer);
await relay(message.peer.id, 'session-description', answer);
}
}
/**
 * @param  {} data
 */
function iceCandidate(data) {
let message = JSON.parse(data.data);
let peer = context.peers[message.peer.id];
peer.addIceCandidate(new RTCIceCandidate(message.data));
}

connect();
