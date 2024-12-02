import websocketConnection from './websocketConnection';

let backend_canister_id = 'bkyz2-fmaaa-aaaaa-qaaaq-cai';
let gateway_address = 'ws://127.0.0.1:8080';
let url = 'http://127.0.0.1:4943';
let local_test = true;
//let url = "https://ic0.app";
//let local_test = false;

let ws = new websocketConnection(
  backend_canister_id,
  gateway_address,
  url,
  local_test
);

document.getElementById('send-message').addEventListener('click', async () => {
  const messageInput = document.getElementById('message-input');
  const message = messageInput.value;

  if (message.trim()) {
    ws.sendMessage(await ws.make_message(message));
    messageInput.value = ''; // Clear input after sending
  }
});
