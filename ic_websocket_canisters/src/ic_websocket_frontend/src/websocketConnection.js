import { ic_websocket_backend } from "../../declarations/ic_websocket_backend";

import {
  Cbor,
  // Certificate,
  // HashTree,
  HttpAgent
  // lookup_path,
  // reconstruct,
  // compare
} from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import addNotification from "./utils/addNotification.js";
// import { lebDecode } from "@dfinity/candid";
// import { PipeArrayBuffer } from "@dfinity/candid/lib/cjs/utils/buffer";

import * as ed from '@noble/ed25519';

import validateBody from "./utils/validateBody";

export default class websocketConnection {
  constructor(canister_id, gateway_address, network_url, local_test) {
    this.canister_id = canister_id;
    this.next_received_num = 0; // Received signed messages need to come in the correct order, with sequence numbers 0, 1, 2...
    this.instance = new WebSocket(gateway_address); // Gateway address. Here localhost to reproduce the demo.
    this.instance.binaryType = "arraybuffer";
    this.bindEvents();
    this.key = ed.utils.randomPrivateKey(); // Generate new key for this websocket connection.
    this.agent = new HttpAgent({ host: network_url });
    if (local_test) {
      this.agent.fetchRootKey();
    }
  }

  async make_message(text) {
    // Our demo application uses simple text message.
    let content = Cbor.encode({
      text: text,
    });

    // Message with all required fields.
    let websocket_message = Cbor.encode({
      client_id: this.client_id, // client_id given by the canister
      sequence_num: this.sequence_num, // Next sequence number to ensure correct order.
      timestamp: Date.now() * 1000000,
      message: content, // Binary application message.
    });

    // Sign the message
    let to_sign = new Uint8Array(websocket_message);
    let sig = await ed.sign(to_sign, this.key);

    // Final signed websocket message
    let message = {
      val: websocket_message,
      sig: sig,
    };

    // Send CBOR encoded
    let ws_message = Cbor.encode(message);
    return ws_message;
  }

  sendMessage(message) {
    console.log("Sending to canister.");
    this.instance.send(message);
    this.sequence_num += 1;
  }

  bindEvents() {
    this.instance.onopen = this.onOpen.bind(this);
    this.instance.onmessage = this.onMessage.bind(this);
    this.instance.onclose = this.onClose.bind(this);
    this.instance.onerror = this.onError.bind(this);
  }

  async onOpen(event) {
    console.log("[open] Connection opened");
    // Put the public key in the canister. Get client_id from the canister.
    const publicKey = await ed.getPublicKey(this.key);
    let client_id = Number(await ic_websocket_backend.ws_register(publicKey));
    this.client_id = client_id;
    this.sequence_num = 0;

    // Send the first message with client and canister id
    let cbor_content = Cbor.encode({
      client_id: client_id,
      canister_id: this.canister_id,
    });

    // Sign so that the gateway can verify canister and client ids match
    let to_sign = new Uint8Array(cbor_content);
    let sig = await ed.sign(to_sign, this.key);

    let first_message = {
      client_canister_id: cbor_content,
      sig: sig,
    };

    // Send the first message
    let ws_message = Cbor.encode(first_message);
    this.sendMessage(ws_message);
    this.sequence_num = 0;
  }

  async onMessage(event) {
    const res = Cbor.decode(event.data);

    let key, val, cert, tree;
    key = res.key;
    val = new Uint8Array(res.val);
    cert = res.cert;
    tree = res.tree;
    let websocketMsg = Cbor.decode(val);

    // Check the sequence number
    let received_num = websocketMsg.sequence_num;
    if (received_num != this.next_received_num) {
      console.log(`Received message sequence number (${received_num}) does not match next expected value (${this.next_received_num}). Message ignored.`);
      return;
    }
    this.next_received_num += 1;

    // Inspect the timestamp
    let time = websocketMsg.timestamp;
    let delay_s = (Date.now() * (10 ** 6) - time) / (10 ** 9);
    console.log(`(time now) - (message timestamp) = ${delay_s}s`);

    // Verify the certificate (canister signature)
    let principal = Principal.fromText(this.canister_id);
    let valid = await validateBody(principal, key, val, cert, tree, this.agent);
    console.log(`Certificate validation: ${valid}`);
    if (!valid) {
      console.log(`Message ignored.`);
      return;
    }

    // Message has been verified
    let appMsg = Cbor.decode(websocketMsg.message);
    let text = appMsg.text;
    console.log(`[message] Message from canister: ${text}`);
    addNotification(text);
    this.sendMessage(await this.make_message(text + "-pong"));
  }

  onClose(event) {
    if (event.wasClean) {
      console.log(
        `[close] Connection closed, code=${event.code} reason=${event.reason}`
      );
    } else {
      console.log("[close] Connection died");
    }
  }

  onError(error) {
    console.log(`[error]`);
  }
}
