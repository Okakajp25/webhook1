const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, SelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, channelLink, cleanContent  } = require("discord.js");
const { settings, botData, guildId } = require("./config.json");
const fs = require("fs");
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const WebSocket = require("ws");
const uuid = require("uuid");
const ip = require("ip");

const { commandsResponse, event, runCommand, checkWS, findWebhook, getScore, sendConsole, getTags, hasTag, postPlayerData, getTime, savePlayersFileData, getPlayersFileData, randomInt, configurePlayerData, t } = require("./util");
const { Server } = require("ws");
const { config } = require("process");

sendConsole.info("Starting bots...", "Bot");

let interval = false;

let serverData = {
    users: 0,
    tps: 2000,
    loadfactor: 0,
    lastPlayers: [],
    lastOpenTime: Date.now(),
    lastCloseTime: Date.now(),
    lastStatusPanelUpdate: Date.now(),
    lastTopicUpdate: Date.now(),
    lastActivityUpdate: Date.now()
};

const running = async () => { try {
    // console.debug("Hi")

    const playersData = getPlayersFileData();

    serverData.users = await getScore("users", "websocket");
    serverData.tps = await getScore("tps", "websocket");
    serverData.loadfactor = await getScore("loadfactor", "websocket");

    const ping = Date.now();
    runCommand("listd").then( async (packet) => {
        const pong = Date.now() - ping;

        const { currentPlayerCount: current, maxPlayerCount: max } = packet.body;
        if (current + Number(settings.setMaxPlayers) !== max) runCommand(`setmaxplayers ${current + Number(settings.setMaxPlayers)}`).catch(() => {});
        if (!packet.body?.details) return runCommand("closewebsocket").catch(() => {});

        const details = JSON.parse(packet.body.details?.slice(5, packet.body.details.length -6));
        const players = details.result.map(p => p.name);
        const lastPlayers = serverData.lastPlayers;
        const joinPlayers = players.filter(p => !lastPlayers.includes(p));
        const leavePlayers = lastPlayers.filter(p => !players.includes(p));

        serverData.lastPlayers = players;

        for (const v of details.result) {
            postPlayerData(v.name, v);

            if (playersData.has(v.name)) {
                let data = playersData.get(v.name);
                if (data.deviceSessionId !== v.deviceSessionId) {
                    sendConsole.warn(t("run.didChanged", [v.name, data.deviceSessionId, v.deviceSessionId]), "Connection/Alt");
                    data.deviceSessionId = v.deviceSessionId;
                }
                if (data.uuid !== v.uuid) {
                    sendConsole.warn(t("run.uuidChanged", [v.name, data.uuid, v.uuid]), "Connection/Alt");
                    data.uuid = v.uuid;
                }

                
                if (settings.onlyLinkedPlayer && !data.link.account.id && data.link.code) {
                    await runCommand(`clear "${data.name}"`).catch(() => {});
                    await runCommand(`effect "${data.name}" weakness 5 255 true`).catch(() => {});
                    await runCommand(`effect "${data.name}" resistance 5 255 true`).catch(() => {});
                    await runCommand(`effect "${data.name}" blindness 5 0 true`).catch(() => {});
                    await runCommand(`effect @e[type=armor_stand,name="${data.name}-not_linked"] invisibility 100000 0 true`).catch(() => {});
                    await runCommand(`effect @e[type=armor_stand,name="${data.name}-not_linked"] resistance 100000 255 true`).catch(() => {});
                    await runCommand(`tp "${data.name}" @e[type=armor_stand,name="${data.name}-not_linked",c=1]`).catch(() => {});
                    await runCommand(`tellraw "${data.name}" {"rawtext":[{"text":" \n\n§l§7Unknown WebSocket Notice\n\n§cIf you want to play on this server, please link your discord account.\n§l§9Discord: §r§9${settings.discordInvite}\n§l§fCode: §r§f${data.link.code}\n\n§7Use this command in discord.\n/link code:${data.link.code}\n\n "}]}`).catch(() => {});
                }

                playersData.set(v.name, configurePlayerData(data));
            } else playersData.set(v.name, configurePlayerData(v));

            
        }

        if (joinPlayers.length) {
            for (const p of joinPlayers) {
                const ply = playersData.get(p);
                const discordAccount = ply.link.account.id ? ", " + t("run.join.haveDiscord", [client.users.cache.get(ply.link.account.id)?.tag || ply.link.account.tag]) : "";
                sendConsole.info(t("run.join.connected", [p, (ply?.deviceSessionId + discordAccount)]), "Minecraft/Connection");

                const embed = new EmbedBuilder()
                .setColor(0x34CE25)
                .setTitle(`${settings.emoji.join ? settings.emoji.join : "->"} ${p} (${current}/${max})`);
                client.channels.cache.get(settings.channels.mainChannelId).send({ embeds: [embed] });

                if (Array.from(playersData).map(x => { if (x[1].name !== ply.name) return x[1].deviceSessionId}).includes(ply.deviceSessionId)) {
                    let accounts = [];
                    for (const account of Array.from(playersData)) if (ply.deviceSessionId === account[1].deviceSessionId) accounts.push(account);
                    if (ply.name !== accounts[0][0]) sendConsole.warn(t("run.join.altAccount", [ply.name, accounts[0][0]]), "Connection/Alt");
                }
                if (settings.onlyLinkedPlayer && !ply.link.account.id) {
                    await runCommand(`effect "${ply.name}" weakness 5 255 true`).catch(() => {});
                    await runCommand(`kill @e[type=armor_stand,name="${ply.name}-not_linked"]`).catch(() => {});
                    await runCommand(`summon armor_stand "${ply.name}-not_linked"`).catch(console.error);
                    await runCommand(`tp @e[type=armor_stand,name="${ply.name}-not_linked"] "${ply.name}"`).catch(() => {});

                    const codeNumber = randomInt(111111, 999999);

                    ply.link.code = codeNumber;
                    ply.link.requested = Date.now();
                    playersData.set(p, ply);
                    
                }
            }
        }

        if (leavePlayers.length) {
            for (const p of leavePlayers) {
                const ply = playersData.get(p);
                const discordAccount = ply.link.account.id ? ", " + t("run.leave.haveDiscord", [client.users.cache.get(ply.link.account.id)?.tag || ply.link.account.tag]) : "";
                sendConsole.info(t("run.leave.disconnected", [p, (ply?.deviceSessionId + discordAccount)]), "Minecraft/Disconnect");

                const embed = new EmbedBuilder()
                .setColor(0xE63636)
                .setTitle(`${settings.emoji.leave ? settings.emoji.leave : "<-"} ${p} (${current}/${max})`);
                client.channels.cache.get(settings.channels.mainChannelId).send({ embeds: [embed] });
            }
        }

        if (Date.now() - serverData.lastStatusPanelUpdate > 10000) {
            const Players = details.result.map(p => p.name);
            for (const i in Players) if (!playersData.get(Players[i])?.deviceSessionId.match(/-/)) Players[i] = Players[i] + " " + t("run.status.mobile");
            const embed = new EmbedBuilder()
            .setColor(0x34CE25)
            .setTitle(t("run.status.text", [settings.serverName]))
            .setDescription(t("run.status.online", [settings.serverName, packet.body.currentPlayerCount, packet.body.maxPlayerCount]))
            .addFields(
                { name: t("run.status.players.name"), value: t("run.status.players.value", [Players.join("\n")]), inline: false },
                { name: t("run.status.ping.name"), value: t("run.status.ping.value", [pong]), inline: true },
                { name: t("run.status.tps.name"), value: t("run.status.tps.value", [String(serverData.tps / 10)]), inline: true },
                { name: t("run.status.updated.name"), value: t("run.status.updated.value", [getTime().unix]), inline: true },
                { name: t("run.status.opened.name"), value: t("run.status.opened.value", [getTime(serverData.lastOpenTime).unix]), inline: false },
            )
            .setTimestamp()
            .setFooter({ text: settings.serverName, iconURL: client.user.displayAvatarURL() });
    
            const Status = client.channels.cache.get(settings.channels.statusChannelId);
            const lastMessage = await Status.messages.fetch(Status?.lastMessageId);
            if (lastMessage?.author.id === client.user.id) {
                lastMessage.edit({ embeds: [embed] });
            } else {
                Status.messages.fetch({ limit: 3, cache: false })
                .then(messages => messages.map(message => message.delete()));
                Status.send({ embeds: [embed] });
            };

            serverData.lastStatusPanelUpdate = Date.now();
        }

        if (Date.now() - serverData.lastTopicUpdate > 300000) {
            client.channels.cache.get(settings.channels.mainChannelId).setTopic(t("run.topic", [current, max, serverData.tps / 10, pong, serverData.users, Math.round(Date.now() / 1000)]));

            serverData.lastTopicUpdate = Date.now();
        }
        
        if (Date.now() - serverData.lastActivityUpdate > 3000) {
            client.user.setActivity(t("run.activity", [current, max, pong]));
            serverData.lastActivityUpdate = Date.now();
        }
        if (pong > 500) sendConsole.warn(t("run.longRespond", [pong]), "Minecraft");

        if (joinPlayers.length) savePlayersFileData(playersData);
    }).catch(console.error);
    
} catch (e) {
    sendConsole.error(`${e.stack}`, "Minecraft");
}}

const wss = new WebSocket.Server({port: settings.port});

wss.on("connection", async (socket) => { try {
    sendConsole.info(t("connection.connected"), "Minecraft");

    socket.send(event("PlayerMessage"));
    socket.send(event("commandResponse"));

    interval = setInterval(running, settings.runTime);
    serverData.lastOpenTime = Date.now();

    serverData.lastPlayers = [];

    runCommand("listd", socket).catch(() => {});;
    
    setTimeout(async () => {

        const embed = new EmbedBuilder()
        .setColor(0x34CE25)
        .setTitle(t("connection.open.text", [settings.serverName]))
        .setTimestamp()
        .setFooter({ text: t("connection.open.by", [(await runCommand("getlocalplayername")).body.statusMessage]), iconURL: client.user.displayAvatarURL() });
    
        if (embed) await client.channels.cache.get(settings.channels.mainChannelId).send({ embeds: [embed] });
    }, 1000)
    

    

    
    
    // running();

    socket.on("message", async PACKET => {
        const packet = JSON.parse(PACKET);
        

        if (packet.header?.messagePurpose === "commandResponse")
            commandsResponse.set(packet.header.requestId, packet);

        if (packet.header?.eventName === "PlayerMessage" && ["chat", "say", "me", "tell"].includes(packet.body.type)) {

            
            // return
            const sender = packet.body.sender.replace(/§./g, "");
            const receiver = packet.body.receiver.replace(/§./g, "");
            const msg = packet.body.message.replace(/§./g, "").replace(/@/g, "`@`");

            
            const main = await findWebhook(client, settings.channels.mainChannelId);

            if (sender === "" || msg === "") return;

            // console.debug(packet);
            const playersData = getPlayersFileData();
            const playerData = playersData.get(sender);

            switch (packet.body.type) {
                case "chat": {
                    sendConsole.log(t("chat.chat.console", [sender, msg]), "Chat");
                    if (client.users.cache.has(playerData.link.account.id)) {
                        await main.send({
                            avatarURL: client.users.cache.get(playerData.link.account.id).avatarURL(),
                            username: t("chat.chat.username", [sender]),
                            content: t("chat.chat.content", [msg])
                        })
                    } else {
                        await main.send({
                            username: t("chat.chat.username", [sender]),
                            content: t("chat.chat.content", [msg])
                        })
                    }
                    
                    break;
                }
                case "say": {
                    if (!settings.sendSay) return;
                    sendConsole.log(t("chat.say.console", [sender, msg.slice(sender.length +3)]), "Chat");
                    await main.send({
                        username: t("chat.say.username", [sender]),
                        content: t("chat.say.content", [msg.slice(sender.length +3)])
                    })
                    break;
                }
                case "me": {
                    if (!settings.sendMe) return;
                    sendConsole.log(t("chat.me.console", [sender, msg]), "Chat");
                    await main.send({
                        username: t("chat.me.username", [sender]),
                        content: t("chat.me.content", [msg])
                    })
                    break;
                }
                case "tell" :{
                    try {
                        const rawtext = JSON.parse(msg).rawtext;
                        if(!(receiver.toLowerCase()).includes(sender.toLowerCase())) return;
                        if (rawtext[0] && rawtext[0]?.translate === "chat.type.text") {
                            const chat = rawtext[0].with.rawtext[1].text;
                            if (chat === "") return;
                            sendConsole.log(t("chat.tell.console", [receiver, chat]), "Chat");
                            if (playerData.link.account.id) {
                                await main.send({
                                    avatarURL: client.users.cache.get(playerData.link.account.id).avatarURL(),
                                    username: t("chat.tell.username", [receiver]),
                                    content: t("chat.tell.content", [chat])
                                })
                            } else {
                                await main.send({
                                    username: t("chat.tell.username", [receiver]),
                                    content: t("chat.tell.content", [chat])
                                })
                            }
                        }
                        // if (rawtext[2]?.text === " has been banned by Unknown Anti-Cheat for Unfair Advantage. Check: ") {
                        //     const embed = new EmbedBuilder()
                        //     .setColor(0x0099FF)
                        //     .setTitle(`Detection results for ${rawtext[1].text}`)
                        //     .setAuthor({ name: settings.compatible === "UAC" ? "Unknown Anti-Cheat" : "Unknown Anti-Grief", url: settings.compatible === "UAC" ? "https://github.com/191225/Unknown-Anti-Cheat" : "https://github.com/191225/Unknown-Anti-Grief" })
                        //     .addFields(
                        //         { name: "Player", value: rawtext[1].text, inline: true },
                        //         { name: "Check", value: rawtext[3].text, inline: true }
                        //     )
                        //     .setTimestamp();

                        //     if (settings.playerDataDisclosure.includes(rawtext[3].text.split("/")[0])) {
                        //         embed.addFields(
                        //             { name: "deviceSessionId", value: playersData.get(rawtext[1].text)?.deviceSessionId},
                        //             { name: "uuid", value: playersData.get(rawtext[1].text)?.uuid}
                        //         )
                        //     }
                        

                        //     const report = client.channels.cache.get(settings.channels.reportChannelId);
                        //     report.threads.create({
                        //         name: `"${rawtext[1].text}"`,
                        //         message: {
                        //             embeds: [embed],
                        //         },
                        //         appliedTags: settings.reportChannelsTagsId
                        //     })
                        //     .then(threadChannel => console.log(threadChannel.id))
                        //     .catch(console.error);
                        // }
                        // if (rawtext[0]?.text?.includes(" has been ")) {
                        //     await main.send({
                        //         username: settings.compatible === "UAC" ? "Unknown Anti-Cheat" : "Unknown Anti-Grief",
                        //         content: `**${rawtext[0].text}**`
                        //     })
                        // }
                    } catch (e) {
                        sendConsole.error(`${e.stack}`, "Minecraft");
                    }
                    break;
                }
            }
        }
    })

    socket.on("close", async (code, reason) => {

        serverData.lastCloseTime = Date.now();

        sendConsole.info(t("disconnect.text"), "Minecraft");
        client.user.setActivity(t("status.activity"));
        
        if (interval) clearInterval(interval);

        const embed = new EmbedBuilder()
        .setColor(0xD81111)
        .setTitle(t("disconnect.close.text", [settings.serverName]))
        .setTimestamp()
        .setFooter({ text: t("disconnect.close.footer", [settings.serverName, code]), iconURL: client.user.displayAvatarURL() });
    
        client.channels.cache.get(settings.channels.mainChannelId).send({ embeds: [embed] });

        const embed2 = new EmbedBuilder()
        .setColor(0xE63636)
        .setTitle(t("status.text", [settings.serverName]))
        .setDescription(t("status.offline", [settings.serverName]))
        .addFields(
            { name: t("status.updated.name"), value: t("status.updated.value", [getTime().unix]), inline: true },
            { name: t("status.closed.name"), value: t("status.closed.value", [getTime(serverData.lastCloseTime).unix]), inline: false },
        )
        .setTimestamp()
        .setFooter({ text: t("status.footer", [settings.serverName]), iconURL: client.user.displayAvatarURL() });
    
        const Status = client.channels.cache.get(settings.channels.statusChannelId);
        const lastMessage = Status.lastMessage;
        if (lastMessage?.author.id === client.user.id) {
            lastMessage.edit({ embeds: [embed2] });
        } else {
            Status.messages.fetch({ limit: 3, cache: false })
            .then(messages => messages.map(message => message.delete()));
            Status.send({ embeds: [embed2] });
        };
        JSON.parse
    })
} catch (e) {
    sendConsole.error(`${e.stack}`, "Minecraft");
}})


client.on("messageCreate", async message => { try {
    if (message.author.bot || message.author.system) return;

    if (message.channelId === settings.channels.mainChannelId) {
        const files = message.attachments.map(value => value.name);
        if (files.length > 0) {
            if (message.content) message.content += ` (+${files.length}files ${files.join(", ")})`;
                else message.content = `${files.join(", ")}`
        }

        if (settings.sendMessageDelete) {
            message.delete().then(async () => {
                checkWS(client, settings.channels.mainChannelId);
                const main = await findWebhook(client, settings.channels.mainChannelId);
                await main.send({
                    username: message.author.username,
                    avatarURL: message.author.displayAvatarURL(),
                    content: message.content
                });
                runCommand(`tellraw @a {"rawtext":[{"translate":"chat.type.text","with":["${t("chat.discord.author", [message.author.tag])}","${t("chat.discord.content", [message.content])}"]}]}`).catch(() => {});
            })
        } else runCommand(`tellraw @a {"rawtext":[{"translate":"chat.type.text","with":["${t("chat.discord.author", [message.author.tag])}","${t("chat.discord.content", [message.content])}"]}]}`).catch(() => {});

        sendConsole.log(`${message.author.tag}: ${message.content}`, "Chat");
    
    }
    
    if (message.channelId === settings.channels.consoleChannelId && settings.console) {
        if (settings["kill@eProtection"] && message.content.replace(/( )/g, "").match(/(kill@e)/))
            if (!message.content.replace(/( )/g, "").split("kill@e")[1].startsWith("["))
                return sendConsole.error(t("console.kill@eProtection"));

        if (settings.commands.close.includes(message.content)) {
            message.content = "closewebsocket";
            sendConsole.info(t("console.disconnecting"), "Minecraft");
        }
        if (message.content === "ping") {
            const ping = Date.now();
            runCommand("list").then((packet) => {
                const pong = Date.now() - ping;
                sendConsole.info(t("console.pong", [pong]), "Command");
            }).catch((reason) => sendConsole.error(reason, "Command"));
        } else {
            runCommand(message.content).then((packet) => {
                if (packet.body.statusMessage?.includes(`">>`) || packet.body.statusMessage?.includes(`<<"`)) sendConsole.error(packet.body.statusMessage, "Command");
                    else sendConsole.info(packet.body.statusMessage, "Command");
            }).catch((reason) => sendConsole.error(reason, "Command"));
        }
        
    }
    
} catch (e) {
    sendConsole.error(`${e.stack}`, "Bot");
}})

client.on("interactionCreate", async interaction => { try {
    if (!interaction.isChatInputCommand()) return;

	const { commandName } = interaction;

    switch (commandName) {
        case "help": {
            const helpEmbed = new EmbedBuilder()
			.setColor(0xFFFFFF)
			.setTitle(t("commands.help.text"))
			.setDescription(t("commands.help.description"))
			.addFields(
				{
					name: "Command",
					value: `${t("commands.help.commands.help")}\n\t`
					+ `${t("commands.help.commands.ping")}\n\t`
                    + `${t("commands.help.commands.server")}\n\t`
                    + `${t("commands.help.commands.list")}\n\t`
                    + `${t("commands.help.commands.run")}\n\t`
					+ `${t("commands.help.commands.player-data")}`
				},
                {
					name: t("commands.help.connect.text"),
					value: t("commands.help.connect.command", [ip.address("public", "ipv4"), settings.port])
				}
			)

			const button = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setLabel(t("commands.help.support"))
					.setStyle(ButtonStyle.Link)
					.setURL("https://discord.gg/QF3n85dr4P")
			);


			await interaction.reply({ embeds: [helpEmbed], components: [button] });
            break;
        }
        case "ping": {
            const embed = new EmbedBuilder().setTitle(t("commands.ping.wait.text")).setDescription(t("commands.ping.wait.description")).setColor(0x707070);
            await interaction.reply({ embeds: [embed], ephemeral: true });


            const ping = Date.now();
            runCommand("list").then(async (packet) => {
                const pong = Date.now() - ping;
                const embed = new EmbedBuilder()
                .setTitle(t("commands.ping.pong.text"))
                .setColor(0x29ED42)
                .addFields(
                    { name: t("commands.ping.pong.server"), value: t("commands.ping.pong.ms", [pong]), inline: true },
                    { name: t("commands.ping.pong.bot"), value: t("commands.ping.pong.ms", [client.ws.ping]), inline: true }
                );
                await interaction.editReply({ embeds: [embed], ephemeral: true });
            })
            .catch(async (reason) => {
                const embed = new EmbedBuilder()
                .setTitle(t("commands.ping.pong.error"))
                .setColor(0xDF2424)
                .setDescription(reason)
                .addFields(
                    { name: t("commands.ping.pong.server"), value: "N/A", inline: true },
                    { name: t("commands.ping.pong.bot"), value: t("commands.ping.pong.ms", [client.ws.ping]), inline: true }
                );
                await interaction.editReply({ embeds: [embed], ephemeral: true });
            });
            break;
        }
        case "server":
        case "list": {
            const ping = Date.now();

            const playersData = getPlayersFileData();
            const embed = new EmbedBuilder().setDescription(t("commands.list.wait")).setColor(0x707070);
            await interaction.reply({ embeds: [embed], ephemeral: true });

            runCommand("listd").then(async (packet) => {
                const pong = Date.now() - ping;

                if (!packet.body?.details) return runCommand("closewebsocket").catch(() => {});

                const details = JSON.parse(packet.body.details?.slice(5, packet.body.details.length -6));

                const Players = details.result.map(p => p.name);
                for (const i in Players) if (!playersData.get(Players[i])?.deviceSessionId.match(/-/)) Players[i] = Players[i] + " " + t("run.status.mobile");
                const embed = new EmbedBuilder()
                .setColor(0x34CE25)
                .setTitle(t("run.status.text", [settings.serverName]))
                .setDescription(t("run.status.online", [settings.serverName, packet.body.currentPlayerCount, packet.body.maxPlayerCount]))
                .addFields(
                    { name: t("run.status.players.name"), value: t("run.status.players.value", [Players.join("\n")]), inline: false }
                )
                .setTimestamp()
                .setFooter({ text: settings.serverName, iconURL: client.user.displayAvatarURL() });

                await interaction.editReply({ embeds: [embed], ephemeral: true });
            }).catch(async (reason) => {
                sendConsole.error((reason.message, reason.stack));
                const embed = new EmbedBuilder()
                .setColor(0xE63636)
                .setTitle(t("run.status.text", [settings.serverName]))
                .setDescription(String(reason))
                .addFields(
                    { name: t("status.closed.name"), value: t("status.closed.value", [getTime(serverData.lastCloseTime).unix]), inline: false }
                )
                .setTimestamp()
                .setFooter({ text: t("run.status.footer", [settings.serverName]), iconURL: client.user.displayAvatarURL() });

                await interaction.editReply({ embeds: [embed], ephemeral: true });
            })
            
            break;
        }
        case "link": {
            const player = interaction.options.getString("player");
            const code = interaction.options.getNumber("code");

            if (code) {
                if (code.toString().length !== 6)
                    return await interaction.reply({ embeds: [
                        new EmbedBuilder().setDescription(t("commands.link.denied")).setColor(0xDF2424)
                    ], ephemeral: true });


                const user = interaction.user;
                const playersData = getPlayersFileData();

                if (Array.from(playersData).find(v => v[1].link.account.id === user.id)) 
                    return await interaction.reply({ embeds: [
                        new EmbedBuilder().setDescription(`You have already linked to '${Array.from(playersData).find(v => v[1].link.account.id === user.id)[0]}'.`).setColor(0xDF2424)
                    ], ephemeral: true });
                
                const name = Array.from(playersData).find(v => v[1].link.code === code);
                
                if (!name)
                    return await interaction.reply({ embeds: [
                        new EmbedBuilder().setDescription(t("commands.link.denied")).setColor(0xDF2424)
                    ], ephemeral: true });

                const player = name[1];
                
                player.link.requested = Date.now();
                player.link.account = {
                    id: user.id,
                    tag: user.tag
                }
                savePlayersFileData(playersData);
                await interaction.reply({ embeds: [
                    new EmbedBuilder().setDescription(t("commands.link.linked.now", [player.name])).setColor(0x34CE25)
                ], ephemeral: true }).then(() => {
                    const tag = client.users.cache.get(player.link.account.id).tag;
                    runCommand(`tellraw "${player.name}" {"rawtext":[{"text":"§7[UWS] ${t("commands.link.linked.now", [tag ? tag : player.link.account.tag])}"}]}`).catch(() => {});
                    runCommand(`tag "${player.name}" add "uws:linked"`).catch(() => {});
                    runCommand(`kill @e[type=armor_stand,name="${player.name}-not_linked"]`).catch(() => {});
                });
            } else if (player) {

                const user = interaction.user;
                const playersData = getPlayersFileData();

                const player_ = Array.from(playersData).find(v => v[1].link.account.id === user.id);

                if (player_) 
                    return await interaction.reply({ embeds: [
                        new EmbedBuilder().setDescription(t("commands.link.linked.linked", [player_[0], getTime(player_[1].link.requested).unix])).setColor(0xDF2424)
                    ], ephemeral: true });

                if (serverData.lastPlayers.includes(player)) {
                    const codeNumber = randomInt(111111, 999999);

                    const playerData = playersData.get(player);

                    if (playerData.link.account.id) 
                        return await interaction.reply({ embeds: [
                            new EmbedBuilder().setDescription(t("commands.link.linked.already", [playerData.link.account.tag])).setColor(0xDF2424)
                        ], ephemeral: true });
                    playerData.link.code = codeNumber;
                    playerData.link.requested = Date.now();
                    playersData.set(player, playerData);
                    runCommand(`tellraw "${player}" {"rawtext":[{"text":"§7[UWS] ${t("commands.link.code.text", [codeNumber])}"}]}`)
                    .then(async (packet) => {
                        // console.debug(packet, `tellraw "${player}" {"rawtext":[{"text":"§7[UWS] Your connection code is '${codeNumber}'."}]}`);

                        if (packet.body.recipient[0]) {
                            await interaction.reply({ embeds: [
                                new EmbedBuilder().setDescription(t("commands.link.code.send")).setColor(0x34CE25)
                            ], ephemeral: true }).then(() => savePlayersFileData(playersData));
                        } else {
                            await interaction.reply({ embeds: [
                                new EmbedBuilder().setDescription(t("commands.link.code.failed")).setColor(0xDF2424)
                            ], ephemeral: true }).then(() => savePlayersFileData(playersData));
                        }
                        

                    })
                    .catch(async (reason) => {
                        await interaction.reply({ embeds: [
                            new EmbedBuilder().setDescription(t("commands.link.code.failed") + `\n${reason}`).setColor(0xDF2424)
                        ], ephemeral: true });
                    });
                } else await interaction.reply({ embeds: [
                    new EmbedBuilder().setDescription(t("commands.link.code.offline")).setColor(0xDF2424)
                ], ephemeral: true });
            } else {

                const user = interaction.user;
                const playersData = getPlayersFileData();

                const player = Array.from(playersData).find(v => v[1].link.account.id === user.id);

                if (!player) 
                    return await interaction.reply({ embeds: [
                        new EmbedBuilder().setDescription(t("commands.link.howSend")).setColor(0x34CE25)
                    ], ephemeral: true });

                await interaction.reply({ embeds: [
                    new EmbedBuilder().setDescription(t("commands.link.linked.linked", [player[0], getTime(player[1].link.requested).unix])).setColor(0x34CE25)
                ], ephemeral: true });
            }
            break;
        }
        case "unlink": {
            const user = interaction.user;
            const playersData = getPlayersFileData();
            const player = Array.from(playersData).find(v => v[1].link.account.id === user.id);

            if (!settings.commands.unLinkCommand) 
                return await interaction.reply({ embeds: [
                    new EmbedBuilder().setDescription(t("commands.unlink.disabled")).setColor(0xDF2424)
                ], ephemeral: true });

            if (!player) 
                return await interaction.reply({ embeds: [
                    new EmbedBuilder().setDescription(t("commands.unlink.notLinked")).setColor(0xDF2424)
                ], ephemeral: true });

            player[1].link = {
                requested: null,
                code: null,
                account: {
                    id: null,
                    tag: null
                }
            }

            playersData.set(player[0], player[1]);
            savePlayersFileData(playersData);

            await interaction.reply({ embeds: [
                new EmbedBuilder().setDescription(t("commands.unlink.unlinked")).setColor(0x34CE25)
            ], ephemeral: true });
            break;
        }
        case "run": {
            const ping = Date.now();
            const command = interaction.options.getString("command");

            const embed = new EmbedBuilder().setDescription(t("commands.run.send")).setColor(0x707070);
            await interaction.reply({ embeds: [embed], ephemeral: true });

            if (settings["kill@eProtection"] && command.replace(/( )/g, "").match(/(kill@e)/))
                if (!command.replace(/( )/g, "").split("kill@e")[1].startsWith("["))
                    return await interaction.editReply({ embeds: [
                        new EmbedBuilder().setTitle("Kill @e protection").setColor(0xDF2424).setDescription(t("commands.run.kill@eProtection"))
                    ], ephemeral: true });

            runCommand(command).then(async (packet) => {
                const pong = Date.now() - ping;

                if (packet.body.statusMessage?.includes(`">>`) || packet.body.statusMessage?.includes(`<<"`)) {
                    const embed = new EmbedBuilder()
                    .setTitle(t("commands.run.error"))
                    .setColor(0xDF2424)
                    .setDescription(packet.body.statusMessage)

                    await interaction.editReply({ embeds: [embed], ephemeral: true }); 
                } else {
                    const embed = new EmbedBuilder()
                    .setTitle(packet.body.statusMessage ? packet.body.statusMessage : t("commands.run.executed"))
                    .setColor(0x29ED42)
                    .setFooter({ text: t("commands.run.ping", [pong]), iconURL: client.user.displayAvatarURL() });
                    if (packet.body.statusMessage) embed.setDescription(packet.body.statusMessage);
                    await interaction.editReply({ embeds: [embed], ephemeral: true });
                }

                
            }).catch(async (reason) => {
                const embed = new EmbedBuilder()
                .setTitle(t("commands.run.error"))
                .setColor(0xDF2424)
                .setDescription(reason);

                await interaction.editReply({ embeds: [embed], ephemeral: true });
            })

            break;
        }
        case "player-data": {
            const player = interaction.options.getString("target");

            playersData = new Map(JSON.parse(fs.readFileSync("players_data.json")));
            if (!playersData.has(player)) return await interaction.reply({ content: t("commands.player-data.noData", [player]), ephemeral: true });

            const embed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(player)
            .setDescription("```json\n" + JSON.stringify(playersData.get(player), false, 4) + "```")
            .setTimestamp()
            .setFooter({ text: settings.serverName, iconURL: client.user.displayAvatarURL() });

            await interaction.reply({ embeds: [embed], ephemeral: true });
            
        }
    }
} catch (e) {
    sendConsole.error(`${e.stack}`, "Bot");
}})

client.once("ready", async () => { try {
    
    sendConsole.info(t("console.ready", [settings.language]), "Bot", client);

    serverData.lastCloseTime = Date.now();

    checkWS(client, settings.channels.mainChannelId);

    client.user.setActivity(t("status.activity"));
    serverData.lastActivityUpdate = Date.now();

    const embed = new EmbedBuilder()
    .setColor(0x34CE25)
    .setTitle(t("console.ready", [settings.language]))
    .setTimestamp()
    .setFooter({ text: settings.serverName, iconURL: client.user.displayAvatarURL() });

    client.channels.cache.get(settings.channels.mainChannelId).send({ embeds: [embed] });


    const embed2 = new EmbedBuilder()
    .setColor(0xE63636)
    .setTitle(t("status.text", [settings.serverName]))
    .setDescription(t("status.offline", [settings.serverName]))
    .addFields(
        { name: t("status.updated.name"), value: t("status.updated.value", [getTime().unix]), inline: true },
        { name: t("status.closed.name"), value: t("status.closed.value", [getTime(serverData.lastCloseTime).unix]), inline: false },
    )
    .setTimestamp()
    .setFooter({ text: settings.serverName, iconURL: client.user.displayAvatarURL() });

    const Status = client.channels.cache.get(settings.channels.statusChannelId);
    const lastMessage = await Status.messages.fetch(Status?.lastMessageId);
    if (lastMessage?.author?.id === client.user.id) {
        lastMessage.edit({ embeds: [embed2] });
    } else {
        Status.messages.fetch({ limit: 3, cache: false })
        .then(messages => messages.map(message => message.delete()));
        Status.send({ embeds: [embed2] });
    };
} catch (e) {
    sendConsole.error(`${e.stack}`, "Bot");
}})

client.login(botData.token);