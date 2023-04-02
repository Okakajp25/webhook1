const { SlashCommandBuilder, Routes, PermissionFlagsBits } = require("discord.js");
const { REST } = require("@discordjs/rest");
const { botData, guildId } = require("./config.json");

const GuildCommands = [
    new SlashCommandBuilder()
        .setName("help")
        .setDescription("Displays help for the command."),
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with pong!"),
    new SlashCommandBuilder()
        .setName("server")
        .setDescription("Returns server status."),
    new SlashCommandBuilder()
        .setName("list")
        .setDescription("Returns the players on the server."),
    new SlashCommandBuilder()
        .setName("link")
        .setDescription("Link your Minecraft and Discord accounts.")
        .addStringOption(option => 
            option
            .setName("player")
            .setDescription("Send the code to the player."))
        .addNumberOption(option => 
            option
            .setName("code")
            .setDescription("Authenticate your account.")),
    new SlashCommandBuilder()
        .setName("unlink")
        .setDescription("Unlink your Minecraft and Discord accounts."),
    new SlashCommandBuilder()
        .setName("run")
        .setDescription("Execute the command.")
        .addStringOption(option => 
            option
            .setName("command")
            .setDescription("Specifies the command to be executed.")
            .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
        .setName("player-data")
        .setDescription("Replies with user info!")
        .addStringOption(option => 
            option
            .setName("target")
            .setDescription("Returns detailed information about the player.")
            .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(botData.token);

// rest.put(Routes.applicationGuildCommands(botData.clientId, guildId), { body: [] })
//     .then(() => console.log("Successfully deleted all guild commands."))
//     .catch(console.error);

// rest.put(Routes.applicationCommands(botData.clientId), { body: [] })
//     .then(() => console.log("Successfully deleted all application commands."))
//     .catch(console.error);

rest.put(Routes.applicationGuildCommands(botData.clientId, guildId), { body: GuildCommands })
    .then((data) => console.log(`Successfully registered ${data.length} application commands.`))
    .catch(console.error);