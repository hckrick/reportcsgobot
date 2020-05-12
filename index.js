const SteamUser = require("steam-user");
const SteamTotp = require("steam-totp");
const fs = require("fs");
const request = require("request");
const demofile = require("demofile");
const bz2 = require("unbzip2-stream");
const SteamID = require("steamid");

const Aimbot = require("./detectors/aimbot.js");
const AFKing = require("./detectors/AFKing.js");
const Wallhack = require("./detectors/wallhack.js");
const TeamKill = require("./detectors/teamkill.js");
const TeamDamage = require("./detectors/teamDamage.js");

const Helper = require("./helpers/Helper.js");
const GameCoordinator = require("./helpers/GameCoordinator.js");
const config = require("./config.json");

const steamUser = new SteamUser();
let csgoUser = undefined;

process.on("unhandledRejection", (reason, promise) => {
	console.error("Falha ao conectar, Steam ou o CSGO Cordenador de partidas podem estar Offiline");

	// The process should exit automatically once Steam has successfully logged off
	steamUser.logOff();
});

let data = {
	casesCompleted: 0,
	total: {
		startTimestamp: 0,
		endTimestamp: 0
	},
	download: {
		startTimestamp: 0,
		endTimestamp: 0
	},
	unpacking: {
		startTimestamp: 0,
		endTimestamp: 0
	},
	parsing: {
		startTimestamp: 0,
		endTimestamp: 0
	},
	curcasetempdata: {
		sid: undefined,
		owMsg: undefined,
		wasAlreadyConvicted: false,
		aimbot_infractions: [],
		AFKing_infractions: [],
		Wallhack_infractions: [],
		teamKill_infractions: [],
		teamDamage_infractions: 0,
		Reported: false
	},
	steamProfile: ""
};

let logonSettings = {
	accountName: config.account.username,
	password: config.account.password
};

if (config.account.sharedSecret && config.account.sharedSecret.length > 5) {
	logonSettings.twoFactorCode = SteamTotp.getAuthCode(config.account.sharedSecret);
}

steamUser.logOn(logonSettings);

steamUser.on("loggedOn", async () => {
	console.log("Entrou com sucesso " + steamUser.steamID.toString());
	steamUser.setPersona(SteamUser.EPersonaState.Online);

	console.log("Consultando...");
	let foundProtobufs = Helper.verifyProtobufs();
	if (foundProtobufs) {
		console.log("Encontrado");
	} else {
		console.log("Falha na verificacao ...");
		await Helper.downloadProtobufs(__dirname);
	}

	csgoUser = new GameCoordinator(steamUser);
  console.log(" ******************************************************** ");
	console.log("TRADUZIDO POR iD3");
  console.log(" ********************************************************** ");
  console.log("  ");
  console.log("  ");
	console.log(" (҂`_´) ");
	console.log("<,︻╦╤─ ҉ - -");
	console.log(" /﹋\ ");

	console.log("  ");
	console.log("  ");
	console.log("  ");
	console.log(" ");
	console.log(" ");
	console.log("Verificando atualizacoes...");
	console.log(" ******************************************************** ");



	try {
		let package = JSON.parse(fs.readFileSync("./package.json"));
		let res = await Helper.GetLatestVersion().catch(console.error);

		if (package.version !== res) {
			let repoURL = package.repository.url.split(".");
			repoURL.pop();
			console.log("Nova versao disponivel @ " + repoURL.join("."));
			console.log("Faca o download e reconfigure suas credenciais \"config.json\"");
		} else {
			console.log("Atualizado");
		}
	} catch (e) {
		console.log("Falha ao checar atualizacoes");
	}

	console.log("Iniciando conexao com a rede do CSGO...");
	steamUser.gamesPlayed([730]);
	await csgoUser.start();

	let lang = (await Helper.DownloadLanguage("csgo_english.txt")).lang;

	let mmHello = await csgoUser.sendMessage(
		730,
		csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_MatchmakingClient2GCHello,
		{},
		csgoUser.Protos.csgo.CMsgGCCStrike15_v2_MatchmakingClient2GCHello,
		{},
		csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_MatchmakingGC2ClientHello,
		csgoUser.Protos.csgo.CMsgGCCStrike15_v2_MatchmakingGC2ClientHello,
		30000
	);

	let rank = mmHello.ranking;
	if (rank.rank_type_id !== 6) {
		rank = await csgoUser.sendMessage(
			730,
			csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientGCRankUpdate,
			{},
			csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientGCRankUpdate,
			{
				rankings: {
					rank_type_id: 6
				}
			},
			csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientGCRankUpdate,
			csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientGCRankUpdate,
			30000
		);

		rank = rank.rankings[0];
	}

	console.log("Seu G.H = " + lang.Tokens["skillgroup_" + rank.rank_id] + " esta com " + rank.wins + " vitoria" + (rank.wins === 1 ? "" : "s"));
	if (rank.rank_id < 7 || rank.wins < 150) {
		console.log((rank.rank_id < 7 ? "Sua patente e baixa" : "Ou voce nao tem vitorias suficientes") + "Voce precisa ser Ouro 1 e ter mais de 150 Vitorias no modo competitivo " + lang.Tokens["skillgroup_7"] + ".");
		steamUser.logOff();
		return;
	}

	console.log("Verificando se ha casos de Fiscalizacao disponiveis para analise.");

	doOverwatchCase();
});

steamUser.on("error", (err) => {
	if (csgoUser && csgoUser._GCHelloInterval) clearInterval(csgoUser._GCHelloInterval);

	console.error(err);
});

async function doOverwatchCase() {
	// Redo this every case incase of a short connection loss which reset our presence
	if (typeof config.richPresence !== "undefined") {
		steamUser.uploadRichPresence(730, config.richPresence);
	}

	data.total.startTimestamp = Date.now();
	console.log("-".repeat(20) + "\nCaso de Fiscalizacao solicitado");
	let caseUpdate = await csgoUser.sendMessage(
		730,
		csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_PlayerOverwatchCaseUpdate,
		{},
		csgoUser.Protos.csgo.CMsgGCCStrike15_v2_PlayerOverwatchCaseUpdate,
		{
			reason: 1
		},
		csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_PlayerOverwatchCaseAssignment,
		csgoUser.Protos.csgo.CMsgGCCStrike15_v2_PlayerOverwatchCaseAssignment,
		30000
	);

	if (caseUpdate.caseurl) {
		data.curcasetempdata.owMsg = caseUpdate;
		data.download.startTimestamp = Date.now();

		// Download demo
		if (fs.existsSync("./demofile.dem")) fs.unlinkSync("./demofile.dem");
		console.log("Baixando partidas " + caseUpdate.caseid + " do servidor " + caseUpdate.caseurl);
		console.log(" ******************************************************** ");

		let sid = SteamID.fromIndividualAccountID(caseUpdate.suspectid);
		if (!sid.isValid()) {
			console.log("Adiquirindo a ID do suspeito " + caseUpdate.suspectid);
			doOverwatchCase();
			return;
		}
		data.curcasetempdata.sid = sid;

		let r = request(caseUpdate.caseurl);
		r.on("response", (res) => {
			res.pipe(fs.createWriteStream("./demofile.bz2")).on("close", async () => {
				data.download.endTimestamp = Date.now();

				// Successfully downloaded, tell the GC about it!
				console.log("Terminamos o download " + caseUpdate.caseid + ", extraindo...");
				console.log(" ******************************************************** ");

				await csgoUser.sendMessage(
					730,
					csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_PlayerOverwatchCaseStatus,
					{},
					csgoUser.Protos.csgo.CMsgGCCStrike15_v2_PlayerOverwatchCaseStatus,
					{
						caseid: caseUpdate.caseid,
						statusid: 1
					},
					undefined,
					undefined,
					30000
				);

				data.unpacking.startTimestamp = Date.now();

				// Parse the demo
				fs.createReadStream("./demofile.bz2").pipe(bz2()).pipe(fs.createWriteStream("./demofile.dem")).on("close", () => {
					data.unpacking.endTimestamp = Date.now();

					fs.unlinkSync("./demofile.bz2");

					data.parsing.startTimestamp = Date.now();

					console.log("Finalizando a extracao " + caseUpdate.caseid + ", Analisando o Suspeito " + sid.getSteamID64() + "...");
          console.log(" ******************************************************** ");
					fs.readFile("./demofile.dem", (err, buffer) => {
						if (err) return console.error(err);

						data.curcasetempdata.aimbot_infractions = [];
						data.curcasetempdata.AFKing_infractions = [];
						data.curcasetempdata.Wallhack_infractions = [];
						data.curcasetempdata.teamKill_infractions = [];
						data.curcasetempdata.teamDamage_infractions = 0;
						data.curcasetempdata.wasAlreadyConvicted = false;

						let lastProg = -1;
						let playerIndex = -1;
						const demoFile = new demofile.DemoFile();

						demoFile.gameEvents.on("player_connect", getPlayerIndex);
						demoFile.gameEvents.on("player_disconnect", getPlayerIndex);
						demoFile.gameEvents.on("round_freeze_end", getPlayerIndex);

						function getPlayerIndex() {
							playerIndex = demoFile.players.map(p => p.steamId === "BOT" ? p.steamId : new SteamID(p.steamId).getSteamID64()).indexOf(sid.getSteamID64());
						}

						demoFile.on("tickend", (curTick) => {
							demoFile.emit("tickend__", { curTick: curTick, player: playerIndex });
						});

						// Detection
						Aimbot(demoFile, sid, data, config);
						AFKing(demoFile, sid, data, config);
						Wallhack(demoFile, sid, data, config);
						TeamKill(demoFile, sid, data);
						TeamDamage(demoFile, sid, data);

						demoFile.on("progress", (progressFraction) => {
							let prog = Math.round(progressFraction * 100);
							if (prog % 10 !== 0) {
								return;
							}

							if (prog === lastProg) {
								return;
							}

							lastProg = prog;
							console.log("Analisando: " + prog + "%");
						});

						demoFile.parse(buffer);

						demoFile.on("end", async (err) => {
							data.parsing.endTimestamp = Date.now();

							if (err.error) {
								console.error(err);
							}

							console.log("Caso de Fiscalizacao concluido com sucesso " + caseUpdate.caseid);

							// Setup conviction object
							let convictionObj = {
								caseid: caseUpdate.caseid,
								suspectid: caseUpdate.suspectid,
								fractionid: caseUpdate.fractionid,
								rpt_aimbot: (data.curcasetempdata.aimbot_infractions.length > config.verdict.maxAimbot) ? 1 : 0,
								rpt_wallhack: (data.curcasetempdata.Wallhack_infractions.length > config.verdict.maxWallKills) ? 1 : 0, // TODO: Add detection for looking at enemies through walls
								rpt_speedhack: 0, // TODO: Add detection for other cheats (Ex BunnyHopping)
								rpt_teamharm:  (data.curcasetempdata.teamDamage_infractions > config.verdict.maxTeamDamage ||  data.curcasetempdata.AFKing_infractions.length > config.verdict.maxAFKing
									|| data.curcasetempdata.teamKill_infractions.length > config.verdict.maxTeamKills) ? 1 : 0, // TODO: Add detection for damaging teammates
								reason: 3
							};

							if ((data.parsing.endTimestamp - data.parsing.startTimestamp) < (config.parsing.minimumTime * 1000)) {
								// Wait this long before sending the request, if we parse the demo too fast the GC ignores us
								let timer = parseInt((config.parsing.minimumTime * 1000) - (data.parsing.endTimestamp - data.parsing.startTimestamp)) / 1000;

								console.log("Aguarde " + timer + " segundo " + (timer === 1 ? "" : "") + " para evitar que o sistema do CSGO nos desconecte");
								

								await new Promise(r => setTimeout(r, (timer * 1000)));
							}

							// Check the Steam Web API, if a token is provided, if the user is already banned, if so always send a conviction even if the bot didn't detect it
							if (config.parsing.steamWebAPIKey && config.parsing.steamWebAPIKey.length >= 10) {
								let banChecker = await new Promise((resolve, reject) => {
									request("https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=" + config.parsing.steamWebAPIKey + "&format=json&steamids=" + sid.getSteamID64(), (err, res, body) => {
										if (err) {
											reject(err);
											return;
										}

										let json = undefined;
										try {
											json = JSON.parse(body);
										} catch (e) { };

										if (json === undefined) {
											reject(body);
											return;
										}

										if (!json.players || json.players.length <= 0) {
											reject(json);
											return;
										}

										resolve(json.players[0]);
									});
								}).catch((err) => {
									console.error(err);
								});

								if (banChecker && banChecker.NumberOfGameBans >= 1 && banChecker.DaysSinceLastBan <= 7 /* Demos are availble for 1 week */) {
									// If the bot didn't catch the suspect aimbotting it is most likely just a waller and nothing else
									convictionObj.rpt_wallhack = 1;

									console.log("O suspeito já foi banido de forma efetiva ...");

									data.curcasetempdata.wasAlreadyConvicted = true;
								} else {
									console.log("O suspeito ainda não foi banido de acordo com a API do Steam");

									data.curcasetempdata.wasAlreadyConvicted = false;
								}
							}

							if(convictionObj.rpt_aimbot || convictionObj.rpt_wallhack || convictionObj.rpt_speedhack || convictionObj.rpt_teamharm) {
								data.curcasetempdata.Reported = true;
							} else {
								data.curcasetempdata.Reported = false;
							}

							// Once we finished analysing the demo send the results
							let caseUpdate2 = await csgoUser.sendMessage(
								730,
								csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_PlayerOverwatchCaseUpdate,
								{},
								csgoUser.Protos.csgo.CMsgGCCStrike15_v2_PlayerOverwatchCaseUpdate,
								convictionObj,
								csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_PlayerOverwatchCaseAssignment,
								csgoUser.Protos.csgo.CMsgGCCStrike15_v2_PlayerOverwatchCaseAssignment,
								30000
							);

							if (caseUpdate2.caseurl) {
								// We got a new case despite sending a completion... Should never happen
								console.log("Comportamento inesperado: obteve um novo caso. Tentando novamente em 30 segundos");
								setTimeout(doOverwatchCase, (30 * 1000));
								return;
							}

							if (!caseUpdate2.caseid) {
								console.log("Comportamento inesperado: obtive uma recarga apesar do envio ser concluído. Tentando novamente em 30 segundos");
								setTimeout(doOverwatchCase, (30 * 1000));
								return;
							}

							data.total.endTimestamp = Date.now();
							data.casesCompleted++;
							data.curcasetempdata.steamProfile = "https://steamcommunity.com/profiles/"+ sid.getSteamID64() + "/";

							// Print logs
							console.log("ID interno: " + data.casesCompleted);
							console.log("ID do caso: " + caseUpdate2.caseid);
							console.log("Suspeito: " + (data.curcasetempdata.sid ? data.curcasetempdata.sid.getSteamID64() : 0));
              console.log(" ******************************************************** ");
							console.log("Tipo de Infracao:");
							console.log("	Aimbot: " + data.curcasetempdata.aimbot_infractions.length);
							console.log("	Wallhack: " + data.curcasetempdata.Wallhack_infractions.length);
							console.log("	Matou amigo: " + data.curcasetempdata.teamKill_infractions.length);
							console.log("	Fogo amigo: " + data.curcasetempdata.teamDamage_infractions);
							console.log(" ******************************************************** ");
							console.log("	Outros: ");
							console.log("	AFK: " + data.curcasetempdata.AFKing_infractions.length);
							console.log("	Ja foi Reportado: " +(data.curcasetempdata.Reported ? "Yes" : "No"));
							console.log("	Já foi condenado: " +(data.curcasetempdata.wasAlreadyConvicted ? "Yes" : "No"));
							console.log(" ******************************************************** ");
							console.log("Outros dados:");
							console.log("	Total: " + parseInt((data.total.endTimestamp - data.total.startTimestamp) / 1000) + "s");
							console.log("	Download: " + parseInt((data.download.endTimestamp - data.download.startTimestamp) / 1000) + "s");
							console.log("	Extraindo: " + parseInt((data.unpacking.endTimestamp - data.unpacking.startTimestamp) / 1000) + "s");
							console.log("	Análise: " + parseInt((data.parsing.endTimestamp - data.parsing.startTimestamp) / 1000) + "s");
							console.log("	Velocidade da analise: " + caseUpdate2.throttleseconds + "s");
              console.log(" ******************************************************** ");
							if (config.verdict.writeLog) {
								if (!fs.existsSync("./cases")) {
									fs.mkdirSync("./cases");
								}

								if (!fs.existsSync("./cases/" + caseUpdate2.caseid)) {
									fs.mkdirSync("./cases/" + caseUpdate2.caseid);
								}

								// Write case file
								fs.writeFileSync("./cases/" + caseUpdate2.caseid + "/message.json", JSON.stringify(data.curcasetempdata.owMsg, null, 4));
								fs.writeFileSync("./cases/" + caseUpdate2.caseid + "/data.json", JSON.stringify(data, null, 4));
							}

							if (config.verdict.backupDemo) {
								if (!fs.existsSync("./cases")) {
									fs.mkdirSync("./cases");
								}

								if (!fs.existsSync("./cases/" + caseUpdate2.caseid)) {
									fs.mkdirSync("./cases/" + caseUpdate2.caseid);
								}

								// Copy demo
								fs.copyFileSync("./demofile.dem", "./cases/" + caseUpdate2.caseid + "/demofile.dem");
							}

							// Check case limit
							if (config.verdict.maxVerdicts > 0 && data.casesCompleted >= config.verdict.maxVerdicts) {
								console.log("Finalizado " + config.verdict.maxVerdicts + " o caso" + (config.verdict.maxVerdicts === 1 ? "" : "s"));
								steamUser.logOff();
								return;
							}

							// Request a overwatch case after the time has run out
							setTimeout(doOverwatchCase, ((caseUpdate2.throttleseconds + 1) * 1000));
						});
					});
				});
			});
		});
	} else {
		if (!caseUpdate.caseid) {
			// We are still on cooldown
			console.log("Ainda estamos na carregando ... Espere por favor " + (caseUpdate.throttleseconds + 1) + " segundos");

			setTimeout(doOverwatchCase, ((caseUpdate.throttleseconds + 1) * 1000));
			return;
		}

		// We got a completion but without actually sending a completion... Should never happen
		console.log("Comportamento inesperado: foi concluído sem enviar um. Tentando novamente em 30 segundos");
		setTimeout(doOverwatchCase, (30 * 1000));
	}
}
