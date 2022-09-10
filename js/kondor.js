/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 698:
/***/ ((__unused_webpack_module, exports) => {


/* eslint-disable no-undef */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Messenger = void 0;
function getError(e) {
    if (typeof e !== "object")
        return e;
    if (e.message)
        return e.message;
    // console.debug("unknown kondor error");
    // console.debug(e);
    return "unknown kondor error";
}
async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
class Messenger {
    constructor(opts) {
        this.listeners = [];
        this.onExtensionRequest = () => Promise.resolve();
        this.onDomRequest = () => Promise.resolve();
        if (!opts)
            return;
        if (opts.onExtensionRequest) {
            this.onExtensionRequest = opts.onExtensionRequest;
            const listener = async (data, sender, res) => {
                res();
                const { id, command } = data;
                // check if it is a MessageRequest
                if (!command)
                    return;
                const message = { id };
                // console.debug("incoming request", id, ":", command);
                // console.debug((data as MessageRequest).args);
                try {
                    const result = await this.onExtensionRequest(data, id, sender);
                    // check if other process will send the response
                    if (typeof result === "object" &&
                        result !== null &&
                        result._derived) {
                        // console.debug("response", id, "derived");
                        return;
                    }
                    message.result = result;
                }
                catch (error) {
                    message.error = error.message;
                }
                if (typeof message.result === "undefined" && !message.error)
                    return;
                this.sendResponse("extension", message, sender);
            };
            this.listeners.push({ type: "extension", id: "onRequest", listener });
            chrome.runtime.onMessage.addListener(listener);
        }
        if (opts.onDomRequest) {
            this.onDomRequest = opts.onDomRequest;
            const listener = async (event) => {
                const { id, command } = event.data;
                // check if it is a MessageRequest
                if (!command)
                    return;
                const message = { id };
                // console.debug("incoming request", id, ":", command);
                // console.debug((event.data as MessageRequest).args);
                try {
                    const result = await this.onDomRequest(event, id);
                    // check if other process will send the response
                    if (typeof result === "object" &&
                        result !== null &&
                        result._derived) {
                        // console.debug("response", id, "derived");
                        return;
                    }
                    message.result = result;
                }
                catch (error) {
                    message.error = error.message;
                }
                if (typeof message.result === "undefined" && !message.error)
                    return;
                this.sendResponse("dom", message);
            };
            this.listeners.push({ type: "dom", id: "onRequest", listener });
            window.addEventListener("message", listener);
        }
    }
    sendResponse(type, message, sender) {
        // console.debug("outgoing response", message.id, ":");
        // console.debug(message);
        if (type === "dom")
            window.postMessage(message, "*");
        else {
            if (sender && sender.tab)
                chrome.tabs.sendMessage(sender.tab.id, message);
            else
                chrome.runtime.sendMessage(message);
        }
    }
    async sendDomMessage(to, command, args) {
        const reqId = crypto.randomUUID();
        return new Promise((resolve, reject) => {
            // prepare the listener
            const listener = (event) => {
                // ignore requests
                if (event.data.command)
                    return;
                const { id, result, error } = event.data;
                // ignore different ids
                if (id !== reqId)
                    return;
                // send response
                if (error) {
                    // console.debug("error received", id, ":");
                    // console.debug(getError(error));
                    reject(new Error(getError(error)));
                }
                else {
                    // console.debug("response received", id, ":");
                    // console.debug(result);
                    resolve(result);
                }
                this.removeListener(reqId);
            };
            // listen
            this.listeners.push({ type: "dom", id: reqId, listener });
            window.addEventListener("message", listener);
            // send request
            window.postMessage({
                id: reqId,
                command,
                args: args ? JSON.parse(JSON.stringify(args)) : args,
                to,
            }, "*");
            // console.debug("sending message", reqId, command, "to dom");
            // console.debug(args);
        });
    }
    async sendExtensionMessage(to, command, args, opts) {
        const reqId = crypto.randomUUID();
        return new Promise((resolve, reject) => {
            // prepare the listener
            const listener = (data, _sender, res) => {
                res();
                // ignore requests
                if (data.command)
                    return;
                const { id, result, error } = data;
                // ignore different ids
                if (id !== reqId)
                    return;
                // send response
                if (error) {
                    // console.debug("error received", id, ":");
                    // console.debug(getError(error));
                    reject(new Error(getError(error)));
                }
                else {
                    // console.debug("response received", id, ":");
                    // console.debug(result);
                    resolve(result);
                }
                this.removeListener(reqId);
            };
            // listen
            this.listeners.push({ type: "extension", id: reqId, listener });
            chrome.runtime.onMessage.addListener(listener);
            // send request
            const sendMessage = () => {
                if (["popup", "background"].includes(to)) {
                    chrome.runtime.sendMessage({
                        id: reqId,
                        command,
                        args: args ? JSON.parse(JSON.stringify(args)) : args,
                        to,
                    });
                }
                else {
                    // 'to' is tab.id
                    chrome.tabs.sendMessage(to, {
                        id: reqId,
                        command,
                        args: args ? JSON.parse(JSON.stringify(args)) : args,
                        to,
                    });
                }
                // console.debug("sending message", reqId, command, "to", to);
                // console.debug(args);
            };
            sendMessage();
            // define timeout
            if (opts && opts.timeout) {
                setTimeout(() => {
                    reject(new Error("Connection lost"));
                    this.removeListener(reqId);
                }, opts.timeout);
            }
            // ping
            if (opts && opts.ping) {
                (async () => {
                    let retries = (opts === null || opts === void 0 ? void 0 : opts.retries) || 0;
                    await sleep(1000);
                    while (this.listeners.find((l) => l.id === reqId)) {
                        try {
                            await this.sendExtensionMessage(to, "ping", { id: reqId, to }, { timeout: (opts === null || opts === void 0 ? void 0 : opts.pingTimeout) || 80 });
                            await sleep(1000);
                        }
                        catch (error) {
                            if (retries <= 0) {
                                reject(error);
                                this.removeListener(reqId);
                                break;
                            }
                            retries -= 1;
                            console.log(`retrying ${reqId}. remaining retries: ${retries}`);
                            sendMessage();
                            await sleep(100);
                        }
                    }
                })()
                    .then(() => { })
                    .catch((e) => {
                    console.log("ping error:");
                    console.log(e);
                });
            }
        });
    }
    removeListener(id) {
        const index = this.listeners.findIndex((l) => l.id === id);
        if (index < 0)
            return;
        const removed = this.listeners.splice(index, 1);
        const { listener, type } = removed[0];
        if (type === "dom") {
            window.removeEventListener("message", listener);
        }
        else {
            chrome.runtime.onMessage.removeListener(listener);
        }
    }
    removeListeners() {
        this.listeners.forEach((l) => {
            const { type, listener } = l;
            if (type === "dom") {
                window.removeEventListener("message", listener);
            }
            else {
                chrome.runtime.onMessage.removeListener(listener);
            }
        });
        this.listeners = [];
    }
}
exports["default"] = Messenger;
exports.Messenger = Messenger;


/***/ }),

/***/ 339:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getAccounts = void 0;
const Messenger_1 = __webpack_require__(698);
const messenger = new Messenger_1.Messenger();
async function getAccounts() {
    return messenger.sendDomMessage("popup", "getAccounts", {});
}
exports.getAccounts = getAccounts;
exports["default"] = getAccounts;


/***/ }),

/***/ 599:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.provider = void 0;
const Messenger_1 = __webpack_require__(698);
const messenger = new Messenger_1.Messenger({});
exports.provider = {
    async call(method, params) {
        return messenger.sendDomMessage("background", "provider:call", {
            method,
            params,
        });
    },
    async getNonce(account) {
        return messenger.sendDomMessage("background", "provider:getNonce", {
            account,
        });
    },
    async getAccountRc(account) {
        return messenger.sendDomMessage("background", "provider:getAccountRc", {
            account,
        });
    },
    async getTransactionsById(transactionIds) {
        return messenger.sendDomMessage("background", "provider:getTransactionsById", {
            transactionIds,
        });
    },
    async getBlocksById(blockIds) {
        return messenger.sendDomMessage("background", "provider:getBlocksById", {
            blockIds,
        });
    },
    async getHeadInfo() {
        return messenger.sendDomMessage("background", "provider:getHeadInfo");
    },
    async getChainId() {
        return messenger.sendDomMessage("background", "provider:getChainId");
    },
    async getBlocks(height, numBlocks = 1, idRef) {
        return messenger.sendDomMessage("background", "provider:getBlocks", {
            height,
            numBlocks,
            idRef,
        });
    },
    async getBlock(height) {
        return messenger.sendDomMessage("background", "provider:getBlock", {
            height,
        });
    },
    async wait(txId, type = "byBlock", timeout = 30000) {
        return messenger.sendDomMessage("background", "provider:wait", {
            txId,
            type,
            timeout,
        });
    },
    async sendTransaction(transaction, broadcast = true) {
        const response = await messenger.sendDomMessage("background", "provider:sendTransaction", {
            transaction,
            broadcast,
        });
        response.transaction.wait = async (type = "byBlock", timeout = 60000) => {
            return messenger.sendDomMessage("background", "provider:wait", {
                txId: response.transaction.id,
                type,
                timeout,
            });
        };
        return response;
    },
    async submitBlock(block) {
        return messenger.sendDomMessage("background", "provider:submitBlock", {
            block,
        });
    },
    async readContract(operation) {
        return messenger.sendDomMessage("background", "provider:readContract", {
            operation,
        });
    },
};
exports["default"] = exports.provider;


/***/ }),

/***/ 942:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getSigner = exports.signer = void 0;
const Messenger_1 = __webpack_require__(698);
const messenger = new Messenger_1.Messenger({});
function warnDeprecated(fnName) {
    console.warn(`The function kondor.signer.${fnName} will be deprecated in the future. Please use kondor.getSigner(signerAddress).${fnName}`);
}
exports.signer = {
    getAddress: () => {
        warnDeprecated("getAddress");
        throw new Error("getAddress is not available. Please use getAccounts from kondor");
    },
    getPrivateKey: () => {
        warnDeprecated("getPrivateKey");
        throw new Error("getPrivateKey is not available");
    },
    signTransaction: () => {
        warnDeprecated("signTransaction");
        throw new Error("signTransaction is not available. Use sendTransaction instead");
    },
    signHash: () => {
        warnDeprecated("signHash");
        throw new Error("signHash is not available. Use sendTransaction instead");
    },
    signMessage: () => {
        warnDeprecated("signMessage");
        throw new Error("signMessage is not available. Use sendTransaction instead");
    },
    prepareBlock: () => {
        warnDeprecated("prepareBlock");
        throw new Error("prepareBlock is not available");
    },
    signBlock: () => {
        warnDeprecated("signBlock");
        throw new Error("signBlock is not available");
    },
    prepareTransaction: async (transaction) => {
        warnDeprecated("prepareTransaction");
        const tx = await messenger.sendDomMessage("background", "signer:prepareTransaction", { transaction });
        return tx;
    },
    sendTransaction: async (tx, broadcast, abis) => {
        warnDeprecated("sendTransaction");
        const { transaction, receipt } = await messenger.sendDomMessage("popup", "signer:sendTransaction", {
            transaction: tx,
            broadcast,
            abis,
        });
        return {
            receipt,
            transaction: {
                ...transaction,
                wait: async (type = "byBlock", timeout = 30000) => {
                    return messenger.sendDomMessage("background", "provider:wait", {
                        txId: transaction.id,
                        type,
                        timeout,
                    });
                },
            },
        };
    },
};
function getSigner(signerAddress) {
    return {
        getAddress: () => signerAddress,
        getPrivateKey: () => {
            throw new Error("getPrivateKey is not available");
        },
        signHash: (hash) => {
            return messenger.sendDomMessage("popup", "signer:signHash", {
                signerAddress,
                hash,
            });
        },
        signMessage: (message) => {
            return messenger.sendDomMessage("popup", "signer:signMessage", {
                signerAddress,
                message,
            });
        },
        prepareTransaction: async (transaction) => {
            const tx = await messenger.sendDomMessage("background", "signer:prepareTransaction", { signerAddress, transaction });
            return tx;
        },
        signTransaction: async (transaction, abis) => {
            return messenger.sendDomMessage("popup", "signer:signTransaction", {
                signerAddress,
                transaction,
                abis,
            });
        },
        sendTransaction: async (tx, broadcast, abis) => {
            const response = await messenger.sendDomMessage("popup", "signer:sendTransaction", {
                signerAddress,
                transaction: tx,
                broadcast,
                abis,
            });
            response.transaction.wait = async (type = "byBlock", timeout = 60000) => {
                return messenger.sendDomMessage("background", "provider:wait", {
                    txId: response.transaction.id,
                    type,
                    timeout,
                });
            };
            return response;
        },
        prepareBlock: () => {
            throw new Error("prepareBlock is not available");
        },
        signBlock: () => {
            throw new Error("signBlock is not available");
        },
    };
}
exports.getSigner = getSigner;
exports["default"] = getSigner;


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
var exports = __webpack_exports__;
var __webpack_unused_export__;

/*! kondor - MIT License (c) Julian Gonzalez (joticajulian@gmail.com) */
__webpack_unused_export__ = ({ value: true });
const provider_1 = __webpack_require__(599);
const signer_1 = __webpack_require__(942);
const account_1 = __webpack_require__(339);
window.kondor = { provider: provider_1.provider, signer: signer_1.signer, getSigner: signer_1.getSigner, getAccounts: account_1.getAccounts };

})();

/******/ })()
;