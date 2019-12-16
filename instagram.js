/**
 *
 * Copyright 2019 Chuan Khoo.
 * www.chuank.com
 *
 * Original (but deprecated) source built from node-red-node-instagram
 * Copyright 2014 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
module.exports = function(RED) {
	"use strict";
	var crypto = require("crypto");
	var Url = require("url");
	var request = require("request");

	var IMAGE = "image";// currently we're only considering images
	var repeat = 900000; // 15 minutes => the repeat frequency of the input node

	function InstagramCredentialsNode(n) {
		RED.nodes.createNode(this,n);

		var node = this;

		// IG's beta implementation of long-lived tokens (60 days) – credential node will check and refresh automatically after 60 days
		refreshLongLivedAccessToken(node);

		node.interval = setInterval(function() {
			refreshLongLivedAccessToken(node);
		}, 900*1000);													// check for expired token every 15 minutes
	}

	function InstagramNode(n) {
		RED.nodes.createNode(this,n);

		var node = this;
		node.inputType = n.inputType;
		node.outputType = n.outputType;

		node.instagramConfig = RED.nodes.getNode(n.instagram);
		if (!node.instagramConfig) {
			node.warn(RED._("instagram.warn.missing-credentials"));
			return;
		}

		initializeNode(node);

		node.on("close", function() {
			node.inputType = null;
			node.outputType = null;
		});
	}

	function refreshLongLivedAccessToken(node) {
		var now = Math.floor(Date.now()/1000);
		if(node.credentials.expires_in - now <= 0) {
			console.warn("IG token expired, refreshing...");
			var refreshUrl = "https://graph.instagram.com/refresh_access_token/" +
							"?grant_type=ig_refresh_token" +
							"&access_token=" + node.credentials.access_token;

			request.get(refreshUrl, function(err, res, data){
				if (err) {
					return res.send(RED._("instagram.error.request-error", {err: err}));
				}
				if (data.error) {
					return res.send(RED._("instagram.error.oauth-error", {error: data.error}));
				}
				if(res.statusCode !== 200) {
					return res.send(RED._("instagram.error.unexpected-statuscode", {statusCode: res.statusCode, data: data}));
				}

				var pData = JSON.parse(data);
				node.credentials.access_token = pData.access_token;
				node.credentials.expires_in = Math.floor(Date.now()/1000) + pData.expires_in - 15;		// give extra 15 seconds just in case expiry clock is somehow askew

				RED.nodes.addCredentials(node.id, node.credentials);
			});
		}
	}

	// WIP
	// function downloadImageAndSendAsBuffer(node, url, msg) {
	// 	request({ uri : url, encoding : null}, function (error, response, body) {
	// 		if (!error && response.statusCode === 200) {
	// 			msg.payload = body;
	// 			node.send(msg);
	// 		} else {
	// 			node.warn(RED._("instagram.warn.image-not-sent", {error: error, response: response}));
	// 		}
	// 	});
	// }

	// initialize the node: retrieve saved access token + obtain media from Instagram
	function initializeNode(node) {
		if(node.instagramConfig && node.instagramConfig.credentials) {
			if(!node.instagramConfig.credentials.access_token) {
				node.warn(RED._("instagram.warn.missing-accesstoken"));
				return;
			}
		} else {
			node.warn(RED._("instagram.warn.missing-configuration"));
			return;
		}

		retrieveIGMedia(node);

		// setup an interval to call retrieveIGMedia
		// if(node.interval) {
		// 	node.intervalID = setInterval(function() { // self trigger
		// 		retrieveIGMedia(node);
		// 	}, node.interval*1000);
		// }
	}

	function retrieveIGMedia(node) {
		// no longer using instagram_node; deprecated calls in that node make it unusable! rolling our own here on out...
		var mediaUrl = "https://graph.instagram.com/" + node.instagramConfig.credentials.user_id + "/media/";
		mediaUrl += "?fields=media_type,media_url,caption,timestamp";
		mediaUrl += "&access_token=" + node.instagramConfig.credentials.access_token;

		request.get(mediaUrl, function(err, res, data){
			if (err) {
				return res.send(RED._("instagram.error.request-error", {err: err}));
			}
			if (data.error) {
				return res.send(RED._("instagram.error.request-error", {error: data.error}));
			}
			if(res.statusCode !== 200) {
				return res.send(RED._("instagram.error.unexpected-statuscode", {statusCode: res.statusCode, data: data}));
			}

			// for now, this call seems to retrieve ALL of a user's media with a 10k count limit
			// field expansion to apply a limit is unsupported!
			console.log("@@@@@@@@@@MEDIA@@@@@@@@@@@@");
			console.log(data);
			console.log("@@@@@@@@@@/MEDIA@@@@@@@@@@@");

			var msg = {};
			msg.payload = data;
			node.send(msg);
		});
	}

	// function handleQueryNodeInput(node, msg) {
	// 	if (node.inputType === "photo") {
	// 		node.ig.user_media_recent("self", { count : 1, min_id : null, max_id : null}, function(err, medias, pagination, remaining, limit) {
	// 			if (err) {
	// 				node.warn(RED._("instagram.warn.userphoto-fetch-fail", {err: err}));
	// 			}
	// 			if(medias.length > 0) { // if the user has uploaded something to Instagram already
	// 				if(medias[0].type === IMAGE) {
	// 					if(medias[0].location) {
	// 						if(medias[0].location.latitude) {
	// 							if(!msg.location) {
	// 								msg.location = {};
	// 							}
	// 							msg.location.lat = medias[0].location.latitude;
	// 						}
	// 						if(medias[0].location.longitude) {
	// 							if(!msg.location) {
	// 								msg.location = {};
	// 							}
	// 							msg.location.lon = medias[0].location.longitude;
	// 						}
	// 					}
	//
	// 					if(medias[0].created_time) {
	// 						msg.time = new Date(medias[0].created_time * 1000);
	// 					}
	//
	// 					var url;
	//
	// 					if(medias[0].images && medias[0].images.standard_resolution && medias[0].images.standard_resolution.url) {
	// 						url = medias[0].images.standard_resolution.url;
	// 					} else {
	// 						node.warn(RED._("instagram.warn.ignoring-media"));
	// 						return;
	// 					}
	//
	// 					if (node.outputType === "link") {
	// 						msg.payload = url;
	// 						node.send(msg);
	// 					} else if (node.outputType === "buffer") {
	// 						downloadImageAndSendAsBuffer(node, url, msg);
	// 					}
	//
	// 				} else {
	// 					node.warn(RED._("instagram.warn.not-a-photo"));
	// 					return;
	// 				}
	// 			} else {
	// 				msg.payload = null;
	// 				node.send(msg);
	// 				node.warn(RED._("instagram.warn.not-uploaded-yet"));
	// 			}
	// 		});
	// 	} else if (node.inputType === "like") {
	// 		node.ig.user_self_liked({ count : 1, max_like_id : null}, function(err, medias, pagination, remaining, limit) {
	// 			if (err) {
	// 				node.warn(RED._("instagram.warn.likedphoto-fetch-fail", {err: err}));
	// 			}
	// 			if(medias.length > 0) { // if the user has liked something to Instagram already
	// 				if(medias[0].type === IMAGE) {
	// 					if(medias[0].location) {
	// 						if(medias[0].location.latitude) {
	// 							if(!msg.location) {
	// 								msg.location = {};
	// 							}
	// 							msg.location.lat = medias[0].location.latitude;
	// 						}
	// 						if(medias[0].location.longitude) {
	// 							if(!msg.location) {
	// 								msg.location = {};
	// 							}
	// 							msg.location.lon = medias[0].location.longitude;
	// 						}
	// 					}
	//
	// 					if(medias[0].created_time) {
	// 						msg.time = new Date(medias[0].created_time * 1000);
	// 					}
	//
	// 					var url;
	//
	// 					if(medias[0].images && medias[0].images.standard_resolution && medias[0].images.standard_resolution.url) {
	// 						url = medias[0].images.standard_resolution.url;
	// 					} else {
	// 						node.warn(RED._("instagram.warn.ignoring-media"));
	// 						return;
	// 					}
	//
	// 					if (node.outputType === "link") {
	// 						msg.payload = url;
	// 						node.send(msg);
	// 					} else if (node.outputType === "buffer") {
	// 						downloadImageAndSendAsBuffer(node, url, msg);
	// 					}
	//
	// 				} else {
	// 					node.warn(RED._("instagram.warn.not-liked-photo"));
	// 					return;
	// 				}
	// 			} else {
	// 				msg.payload = null;
	// 				node.send(msg);
	// 				node.warn(RED._("instagram.warn.not-liked-yet"));
	// 			}
	// 		});
	// 	}
	// }

	// function handleInputNodeInput(node, msg) {
	// 	var areWeInPaginationRecursion = false;
	//
	// 	var idOfLikedReturned;
	// 	var idOfSelfReturned;
	//
	// 	var returnPagefulsOfStuff = function(err, medias, pagination, remaining, limit) {
	//
	// 		var carryOnPaginating = true;
	//
	// 		if (err) {
	// 			node.warn(RED._("instagram.warn.latest-media-fetch-failed", {err: err}));
	// 		}
	//
	// 		if(medias) {
	// 			for(var i = 0; i < medias.length; i++) {
	// 				if (node.inputType === "like") { // like is a special case as per Instagram API behaviour
	// 					if(areWeInPaginationRecursion === false) { // need to set the pointer of latest served liked image before pagination occurs
	// 						idOfLikedReturned = medias[0].id;
	// 					}
	// 					if (medias[i].id === node.latestLikedID || node.latestLikedID === null) { // we finally found the image we already returned or has been there at init
	// 						node.latestLikedID = idOfLikedReturned; // we need to assign the latest liked to the one we returned first => can only do node at the end, otherwise we'd never match break condition and always return everything
	// 						carryOnPaginating = false;
	// 						break;
	// 					}
	// 				}
	//
	// 				if (node.inputType === "photo" && i === 0 && (areWeInPaginationRecursion === false) ) { // only set the served self content ID to equal the first media of the first pagination page and ignore on subsequent pages
	// 					idOfSelfReturned = medias[i].id;
	// 				}
	//
	// 				if (node.inputType === "photo" && (medias[i].id === node.latestSelfContentID) ) { // if we say to the Insta API that we want images more recent than image id "blah", it returns image with that id too
	// 					//deliberate no-op
	// 				} else if(medias[i].type === IMAGE) {
	// 					var url = medias[i].images.standard_resolution.url;
	//
	// 					if(medias[i].location) {
	// 						if(medias[i].location.latitude) {
	// 							if(!msg.location) {
	// 								msg.location = {};
	// 							}
	// 							msg.location.lat = medias[i].location.latitude;
	// 						}
	// 						if(medias[i].location.longitude) {
	// 							if(!msg.location) {
	// 								msg.location = {};
	// 							}
	// 							msg.location.lon = medias[i].location.longitude;
	// 						}
	// 					}
	//
	// 					if(medias[i].created_time) {
	// 						msg.time = new Date(medias[i].created_time * 1000);
	// 					}
	//
	// 					if (node.outputType === "link") {
	// 						msg.payload = url;
	// 						node.send(msg);
	// 					} else if (node.outputType === "buffer") {
	// 						downloadImageAndSendAsBuffer(node, url, msg);
	// 					}
	// 				}
	// 			}
	// 		} else if(areWeInPaginationRecursion === false) {
	// 			node.warn(RED._("instagram.warn.media-fetch-failed"));
	// 			return;
	// 		}
	// 		if(pagination && pagination.next && carryOnPaginating) {
	// 			areWeInPaginationRecursion = true;
	// 			pagination.next(returnPagefulsOfStuff);
	// 		} else {
	// 			node.latestSelfContentID = idOfSelfReturned;
	// 		}
	// 	};
	//
	// 	// If we're processing user content
	// 	if (node.inputType === "photo") {
	// 		node.ig.user_media_recent("self", { count : null, min_id : node.latestSelfContentID, max_id : null}, returnPagefulsOfStuff);
	// 	} else if (node.inputType === "like") { // If we're processing likes
	// 		node.ig.user_self_liked({ count : null, max_like_id : null}, returnPagefulsOfStuff);
	// 	}
	// }

	RED.nodes.registerType("instagram-credentials", InstagramCredentialsNode, {
		credentials: {
			user_id: {type:"text"},
			username: {type:"text"},
			app_id: {type:"text"},
			app_secret: {type:"password"},
			redirect_uri: { type:"text"},
			access_token: {type: "password"},
			expires_in: {type:"number"}	       // expiry date (in seconds) of long-lived access token
		}
	});

	RED.nodes.registerType("instagram", InstagramNode);

	RED.httpAdmin.get("/instagram-credentials/auth", function(req, res) {
		var node_id = req.query.node_id;

		var credentials = RED.nodes.getCredentials(node_id) || {};

		credentials.app_id = req.query.app_id;
		credentials.app_secret = req.query.app_secret;
		credentials.redirect_uri = req.query.redirect_uri;

		if (!credentials.app_id || !credentials.app_secret || ! credentials.redirect_uri) {
			return res.send(RED._("instagram.error.no-ui-credentials"));
		}

		var csrfToken = crypto.randomBytes(18).toString("base64").replace(/\//g, "-").replace(/\+/g, "_");
		credentials.csrfToken = csrfToken;										// csrfToken not registered as type above, so never gets written to disk

		var url = Url.format({
			protocol: "https",
			hostname: "api.instagram.com",
			pathname: "/oauth/authorize/",
			query: {
				app_id: credentials.app_id,												// Instagram Basic Display API now requires 'app_id' instead of 'cliend_id'
				redirect_uri: credentials.redirect_uri,
				response_type: "code",
				scope: "user_profile,user_media",
				state: node_id + ":" + credentials.csrfToken
			}
		});

		res.redirect(url);
		RED.nodes.addCredentials(node_id, credentials);
	});

	RED.httpAdmin.get("/instagram-credentials/auth/callback", function(req, res) {
		var state = req.query.state.split(":");
		var node_id = state[0];
		var csrfToken = state[1];

		var credentials = RED.nodes.getCredentials(node_id) || {};

		if (!credentials || !credentials.app_id || !credentials.app_secret || ! credentials.redirect_uri) {
			return res.send(RED._("instagram.error.no-credentials"));
		}

		if (csrfToken !== credentials.csrfToken) {
			return res.status(401).send(RED._("instagram.error.csrf-token-mismatch"));
		}

		RED.nodes.deleteCredentials(node_id); // we don't want to keep the csrfToken
		// from now on, credentials are in memory only
		delete credentials.csrfToken;

		if(!req.query.code) {
			return res.status(400).send(RED._("instagram.error.no-required-code"));
		}

		credentials.code = req.query.code;

		// ready to send out for a short-lived access token (valid for 1hr)
		request.post({
			url: "https://api.instagram.com/oauth/access_token",
			json: true,
			form: {
				app_id: credentials.app_id,
				app_secret: credentials.app_secret,
				grant_type: "authorization_code",
				redirect_uri: credentials.redirect_uri,
				code: credentials.code
			},
		}, function(err, result, data) {
			if (err) {
				return res.send(RED._("instagram.error.request-error", {err: err}));
			}
			if (data.error) {
				return res.send(RED._("instagram.error.oauth-error", {error: data.error}));
			}
			if(result.statusCode !== 200) {
				return res.send(RED._("instagram.error.unexpected-statuscode", {statusCode: result.statusCode, data: data}));
			}

			if(!data.access_token) {
				return res.send(RED._("instagram.error.accesstoken-fetch-fail"));
			} else {
				// now that we have the short-lived token, send another request out to exchange for a long-lived one!
				var llurl = "https://graph.instagram.com/access_token/" +
									"?grant_type=ig_exchange_token" +
									"&client_secret=" + credentials.app_secret +
									"&access_token=" + data.access_token;

				request.get(llurl, function(err2, res2, data2){
					if (err2) {
						return res2.send(RED._("instagram.error.request-error", {err: err2}));
					}
					if (data2.error) {
						return res2.send(RED._("instagram.error.oauth-error", {error: data2.error}));
					}
					if(res2.statusCode !== 200) {
						return res2.send(RED._("instagram.error.unexpected-statuscode", {statusCode: res2.statusCode, data: data2}));
					}

					var pData2 = JSON.parse(data2);

					// NOTE: previous user_id might be offset by +/- 1 (thanks FB?!?); making an API call to /me retrieves the correct value
					// also take this opportunity to grab the username string
					var userUrl = "https://graph.instagram.com/me/?access_token=" + data.access_token;
					userUrl += "&fields=username";

					request.get(userUrl, function(err3, res3, data3){
						if (err3) {
							return res3.send(RED._("instagram.error.request-error", {err: err3}));
						}
						if (data3.error) {
							return res3.send(RED._("instagram.error.oauth-error", {error: data3.error}));
						}
						if(res3.statusCode !== 200) {
							return res3.send(RED._("instagram.error.unexpected-statuscode", {statusCode: res3.statusCode, data: data3}));
						}

						var pData3 = JSON.parse(data3);

						if(pData3.id) {
							credentials.user_id = pData3.id;
						} else {
							return res.send(RED._("instagram.error.user_id-fetch-fail"));
						}
						if(pData3.username) {
							credentials.username = pData3.username;
						} else {
							return res.send(RED._("instagram.error.username-fetch-fail"));
						}

						// now we have all of the correct data, set it into the credentials objects
						delete credentials.code;
						credentials.access_token = pData2.access_token;
						credentials.expires_in = Math.floor(Date.now()/1000) + pData2.expires_in - 15;		// give 15 seconds just in case expiry clock is somehow askew

						RED.nodes.addCredentials(node_id, credentials);
						res.send(RED._("instagram.message.authorized"));
					});
				});
			}
		});
	});
};
