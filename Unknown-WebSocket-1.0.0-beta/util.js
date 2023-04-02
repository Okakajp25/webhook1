const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, SelectMenuBuilder, ButtonBuilder, ButtonStyle  } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const uuid = require('uuid');
const fs = require('fs');

const { settings, botData, guildId } = require("./config.json");

const { lang } = require(`./locale/${settings.language}.json`);

const commandsResponse = new Map();
let SOCKET = false;
let CLIENT = false;

function event(name) {
    return JSON.stringify({
        "header": {
            "version": 1, 
            "requestId": uuid.v4(),
            "messageType": "commandRequest",
            "messagePurpose": "subscribe"
        },
        "body": {
            "eventName": name
        }
    })
}

const runCommand = async (command, socket = SOCKET) => {
    SOCKET = socket;
    const json = {
        "header": {
            "requestId": uuid.v4(),
            "messagePurpose": "commandRequest",
            "version": 1,
            "messageType": "commandRequest"
        },
        "body": {
            "origin": {
                "type": "player"
            },
            "commandLine": command,
            "version": 1
        }
    };
    const Json = JSON.stringify(json);

    try { socket.send(Json); } catch (e) {}

    return await returnCommandsResponse(json.header.requestId)
}

const returnCommandsResponse = async (responseId) => {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const interval = setInterval(() => {
            if (commandsResponse.has(responseId)) {
                resolve(commandsResponse.get(responseId));
                clearInterval(interval);
                commandsResponse.delete(responseId);
            } else if (!SOCKET) {
                clearInterval(interval);
                commandsResponse.delete(responseId);
                reject("Server is offline.");
            } else if (Date.now() - start > 5000) {
                clearInterval(interval);
                commandsResponse.delete(responseId);
                reject("Server did not respond.");
            }
        });
    });
}

const getScore = async (name, object) => {
    const packet = await runCommand(`scoreboard players test "${name}" ${object} *`);
    return packet.body?.statusMessage?.replace(/[^0-9-]/g, "").replace(/(2147483647|-2147483648)/g, "");
}

const getTags = async (name, type = "player") => {
    const packet = await runCommand(`tag @e[type=${type},name="${name}",c=1] list`);
    const tags_ = packet.body?.statusMessage?.replace(name, "").split(": §a");
    console.debug(tags_);
    tags_.shift();
    console.debug(tags_);
    const tags = tags_.join(": §a").slice(0, (tags_.join(": §a")).length-2).split("§r, §a");
    return tags;
}

const hasTag = async (name, tag, type = "player") => {
    const tags = await getTags(name, type);
    return tags.includes(tag);
}

const sendConsole = {
    log: async (message, type = "", client = CLIENT) => {
        CLIENT = client;
        message = `[${getTime().day} ${getTime().hours}:${getTime().minutes}:${getTime().seconds} LOG ${type}] ${message}`;
        if (message.length > 1800) message = message.slice(0, -(message.length - 1800)) + ` (+${message.length - 1800} additional characters)`;
        console.log(message);
        if (settings && client) {
            const Console = client.channels.cache.get(settings.channels.consoleChannelId);
            const lastMessage = await Console.messages.fetch(Console.lastMessageId);
            if (lastMessage.author.id === client.user.id) {
                const newContent = `${lastMessage.content.slice(0, lastMessage.content.length-3)}\n  ` + message + "```";
                if (newContent.length > 1800) Console.send({ content: "```diff\n  " + message + "```" });
                    else lastMessage.edit({ content: newContent });
            } else Console.send({ content: "```diff\n  " + message + "```" });
        }
    },
    info: async (message, type = "", client = CLIENT) => {
        CLIENT = client;
        message = `[${getTime().day} ${getTime().hours}:${getTime().minutes}:${getTime().seconds} INFO ${type}] ${message}`;
        if (message.length > 1800) message = message.slice(0, -(message.length - 1800)) + ` (+${message.length - 1800} additional characters)`;
        console.info(message);
        if (settings && client) {
            const Console = client.channels.cache.get(settings.channels.consoleChannelId);
            const lastMessage = await Console.messages.fetch(Console.lastMessageId);
            if (lastMessage.author.id === client.user.id) {
                const newContent = `${lastMessage.content.slice(0, lastMessage.content.length-3)}\n  ` + message + "```";
                if (newContent.length > 1800) Console.send({ content: "```diff\n  " + message + "```" });
                    else lastMessage.edit({ content: newContent });
            } else Console.send({ content: "```diff\n  " + message + "```" });
        }
    },
    warn: async (message, type = "", client = CLIENT) => {
        CLIENT = client;
        message = `[${getTime().day} ${getTime().hours}:${getTime().minutes}:${getTime().seconds} WARN ${type}] ${message}`;
        if (message.length > 1800) message = message.slice(0, -(message.length - 1800)) + ` (+${message.length - 1800} additional characters)`;
        console.warn(message);
        if (settings && client) {
            const Console = client.channels.cache.get(settings.channels.consoleChannelId);
            const lastMessage = await Console.messages.fetch(Console.lastMessageId);
            message = message.replace(/(\n  )/g, "\n! ");
            if (lastMessage.author.id === client.user.id) {
                const newContent = `${lastMessage.content.slice(0, lastMessage.content.length-3)}\n! ` + message + "```";
                if (newContent.length > 1800) Console.send({ content: "```diff\n! " + message + "```" });
                    else lastMessage.edit({ content: newContent });
            } else Console.send({ content: "```diff\n! " + message + "```" });
        }
    },
    error: async (message, type = "", client = CLIENT) => {
        CLIENT = client;
        message = `[${getTime().day} ${getTime().hours}:${getTime().minutes}:${getTime().seconds} ERROR ${type}] ${message}`;
        if (message.length > 1800) message = message.slice(0, -(message.length - 1800)) + ` (+${message.length - 1800} additional characters)`;
        console.error(message);
        if (settings && client) {
            const Console = client.channels.cache.get(settings.channels.consoleChannelId);
            const lastMessage = await Console.messages.fetch(Console.lastMessageId);
            message = message.replace(/(\n  )/g, "\n- ");
            if (lastMessage.author.id === client.user.id) {
                const newContent = `${lastMessage.content.slice(0, lastMessage.content.length-3)}\n- ` + message + "```";
                if (newContent.length > 1800) Console.send({ content: "```diff\n- " + message + "```" });
                    else lastMessage.edit({ content: newContent });
            } else Console.send({ content: "```diff\n- " + message + "```" });
        }
    }
}

const getTime = (time = Date.now()) => {
    const day = new Date(time).getDay();
    let Day;
    if (day === 0) Day = t("days.sunday");
        else if (day === 1) Day = t("days.monday");
        else if (day === 2) Day = t("days.tuesday");
        else if (day === 3) Day = t("days.wednesday");
        else if (day === 4) Day = t("days.Thursday");
        else if (day === 5) Day = t("days.friday");
        else if (day === 6) Day = t("days.saturday");

    return {
        month: new Date(time).getMonth(),
        days: new Date(time).getDate(),
        day: Day,
        hours: new Date(time).getHours() < 10 ? `0${new Date(time).getHours()}` : new Date(time).getHours(),
        minutes: new Date(time).getMinutes() < 10 ? `0${new Date(time).getMinutes()}` : new Date(time).getMinutes(),
        seconds: new Date(time).getSeconds() < 10 ? `0${new Date(time).getSeconds()}` : new Date(time).getSeconds(),
        unix: Math.round(new Date(time).getTime() / 1000)
    }
}

const postPlayerData = (player, data) => {
    runCommand(`tag @a[name="${player}",tag="${settings.compatible.toLowerCase()}:getPlayerData"] add "${settings.compatible.toLowerCase()}:PlayerData_${JSON.stringify(data).replace(/"/g, "'")}"`)
    runCommand(`tag @a[name="${player}",tag="${settings.compatible.toLowerCase()}:getPlayerData"] add "${settings.compatible.toLowerCase()}:hasPlayerData"`);
    runCommand(`tag @a[name="${player}",tag="${settings.compatible.toLowerCase()}:getPlayerData"] remove "${settings.compatible.toLowerCase()}:getPlayerData"`);
}

const checkWS = async (client, channelID) => {
    const channel = client.channels.cache.get(channelID);
    channel.fetchWebhooks()
    .then(hooks => {
        if (hooks.size != 1) {
            for (let [id, webhook] of hooks) webhook.delete(`Requested`);
            channel.createWebhook({name: `WebSocket`})
            .then(Webhook => console.log(`Websocket has been created.`))
            .catch(console.error);
        }
    })
    .catch(console.error);
}


const findWebhook = async (client, channelId) => {
    const channel = client.channels.cache.get(channelId);
    const webhooks = await channel.fetchWebhooks();
    const webhook = webhooks.find(wh => wh.token);
    if (!webhook) {
        channel.fetchWebhooks()
        .then(hooks => {
            for (let [id, webhook] of hooks) webhook.delete(`Requested`);
            channel.createWebhook({name: `WebSocket`})
            .then(Webhook => console.log(`Websocket has been created.`))
            .catch(console.error);
        });
        return await findWebhook(client, channelId);
    }
    return webhook;
}

const getPlayersFileData = () => {
    fs.stat("players_data.json", (err, stats) => {
        if (!stats) fs.writeFileSync("players_data.json", JSON.stringify([]));
    })

    if (!fs.readFileSync("players_data.json").length)
        fs.writeFileSync("players_data.json", JSON.stringify([]));

    const data = new Map(JSON.parse(fs.readFileSync("players_data.json")));
    
    return data;
}

const savePlayersFileData = async (playersData) => {
    fs.writeFileSync("players_data.json", JSON.stringify(Array.from(playersData), false, 4));
}

function randomInt (min,max) {
    if (typeof min !== "number" || typeof max !== "number") throw TypeError("bad number");
    if (min >= max) throw TypeError("bad number");
    let patchNumber = 0;
    if (min === 0) {
      min += 1; max += 1; patchNumber += 1;
    } else if (max === 0) {
      min -= 1; max -= 1; patchNumber -= 1;
    }
    let int = false;
    while (!int) {
      const random = Math.round(Math.random() * max * 10);
      if (random >= min && random <= max) int = random;
    }
    return int - patchNumber;
}

const configurePlayerData = (player) => {
    const newPlayer = {
        activeSessionId: player.activeSessionId,
        clientId: player.clientId,
        color: player.color,
        deviceSessionId: player.deviceSessionId,
        globalMultiplayerCorrelationId: player.globalMultiplayerCorrelationId,
        id: player.id,
        name: player.name,
        randomId: player.randomId,
        uuid: player.uuid,
        link: {
            requested: player?.link?.requested || null,
            code: player?.link?.code || null,
            account: {
                id: player?.link?.account?.id || null,
                tag: player?.link?.account?.tag || null
            }
        }
    };
    return newPlayer;
}

const t = (id, spaces) => {
    const paths = id.split('.');
    const objective = paths.pop();
    const path = paths.reduce((p,c) => p[c],lang);
    let text = path[objective];
    if (typeof(text) !== "string") return id;
    for (const i in spaces) text = text.replace(new RegExp(`%${Number(i)+1}`, "g"), spaces[i]);
    return text;
}

module.exports = {
    commandsResponse,
    event,
    runCommand,
    sendConsole,
    getTime,
    checkWS,
    findWebhook,
    getScore,
    getTags,
    hasTag,
    postPlayerData,
    getPlayersFileData,
    savePlayersFileData,
    randomInt,
    configurePlayerData,
    t
}