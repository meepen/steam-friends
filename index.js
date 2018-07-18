#!/usr/bin/env node

const IURLQueue = require("./urlqueue").IURLQueue;
const cla = require("command-line-args");

const options = cla([
    {
        name: "steamid",
        defaultOption: true,
        type: String
    },
    {
        name: "key",
        alias: "k",
        type: String
    },
    {
        name: "depth",
        alias: "d",
        type: Number
    },
    {
        name: "bans",
        alias: "b",
        type: Boolean
    },
    {
        name: "games",
        alias: "g",
        type: Boolean
    },
    {
        name: "pretty",
        alias: "p",
        type: Boolean
    }
])

if (!options.steamid)
    throw new Error("steamid not provided");

if (!isFinite(parseInt(options.steamid)))
    throw new Error("steamid invalid");

if (!options.key)
    throw new Error("no web api key provided");


let key_regex = new RegExp(options.key, "g");
global.debug = function debug(a) {
    process.stderr.write(`${a.toString().replace(key_regex, "<key>")}\n`);
};

let queues = {};
let player_datas = {
    /* "steamid": {
        displayname: "",
        vac_bans: 0,
        game_bans: 0,
        games_played: [appid, ...], 
        countrycode: "",
        visibleprofile: false,
        profilesetup: false,
        lastlogoff: 0,
        createdat: 0,
        lastbanat: 0,
        friends: {steamid:addedtime}
    }*/
};

const continue_queues = function continue_queues() {
    for (let type in queues) {
        let queue = queues[type];
        if (queue.at_max()) 
            return queue.run();
    }

    if (queues.friends.run())
        return;

    if (queues.games.run())
        return;

    if (queues.summary.run())
        return;

    if (queues.bans.run())
        return;
}

const player_data = function player_data(steamid) {
    if (undefined === player_datas[steamid])
        player_datas[steamid] = {
            _need_bans: options.bans ? true : undefined,
            _need_friends: true,
            _need_games: options.games ? true : undefined,
        };
    return player_datas[steamid];
}

const need_player_data = function need_player_data(steamid) {
    let data = player_data(steamid);
    return data._need_bans || data._need_friends || data._need_games;
}


class IFriendFinderQueue extends IURLQueue {
    try_continue() {
        continue_queues();
    }

    data(steamid) {
        return player_data(steamid);
    }

    update(steamid) {
        if (!need_player_data(steamid))
            debug(`got ${steamid}`);
    }
}

class FriendsURLQueue extends IFriendFinderQueue {
    constructor() {
        super(1);
    }

    build_url(items) {
        return `http://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${options.key}&steamid=${items[0]}&relationship=friend`
    }

    callback(items, struct) {
        let friends = struct.friendslist.friends;
        let data = this.data(items[0]);

        data.friends = {}; // steamid: since;

        delete data._need_friends;
        let depth = data.depth + 1;
        for (let friend of friends) {
            data.friends[friend.steamid] = friend.friend_since;
            let user = player_datas[friend.steamid];
            if (user) {
                if (user.depth > depth)
                    user.depth = depth;
                continue;
            }

            queues.summary.push(friend.steamid, depth);
        }

        this.update(items[0]);
    }
}

class SummaryURLQueue extends IFriendFinderQueue {
    constructor() {
        super(100);
    }

    push(item, depth) {
        if (player_datas[item] || depth > options.depth)
            return false;

        this.data(item).depth = depth;
        super.push({
            steamid: item,
            depth: depth
        });
    }

    build_url(items) {
        return `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${options.key}&steamids=${items.map(d => d.steamid).join(",")}`;
    }

    callback(items, struct) {
        for (let player of struct.response.players) {
            let data = this.data(player.steamid);

            data.displayname = player.personaname;
            data.lastlogoff = player.lastlogoff;
            data.profilesetup = player.profilestate == 1;
            if (data.profilesetup)
                data.visibleprofile = player.communityvisibilitystate == 3;

            if (data.visibleprofile) {
                data.createdat = player.timecreated;
                data.countrycode = player.loccountrycode;

                queues.friends.push(player.steamid);
                queues.games.push(player.steamid);
            } else {
                delete data._need_friends;
                delete data._need_games;
            }

            queues.bans.push(player.steamid);
        }
    };
}

class BanURLQueue extends IFriendFinderQueue {
    constructor() {
        super(100);
    }

    build_url(items) {
        return `http://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${options.key}&steamids=${items.join(",")}`;
    }

    callback(items, struct) {
        for (let player of struct.players) {
            let data = this.data(player.SteamId);
            delete data._need_bans;
            data.vac_bans = player.NumberOfVACBans;
            data.game_bans = player.NumberOfGameBans;

            if (data.bans > 0) {
                let date = new Date(Date.now());
                date.setDate(date.getDate() - player.DaysSinceLastBan);

                data.lastbanat = (date / 1000) | 0;
            }

            this.update(player.SteamId);
        }
    }
}

class GamesURLQueue extends IFriendFinderQueue {
    constructor() {
        super(1);
    }

    build_url(items) {
        return `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${options.key}&steamid=${items[0]}&include_played_free_games=1&format=json`;
    }
    
    callback(items, body) {
        let struct = body.response;
        let data = this.data(items[0]);

        // api endpoint no longer has playtime_2weeks, restructure to
        // [appid, ...]
        
        if (struct.games) {
            data.games_played = [];

            for (let game of struct.games) {
                data.games_played.push(game.appid);
            }
        }

        delete data._need_games;
        this.update(items[0]);
    }
}

class NullQueue extends IURLQueue {
    constructor() { super(0); }
    push() { }
    run() { }
    callback() { }
}

queues.friends = new FriendsURLQueue();
queues.summary = new SummaryURLQueue();
queues.bans = options.bans ? new BanURLQueue() : new NullQueue();
queues.games = options.games ? new GamesURLQueue() : new NullQueue();


queues.summary.push(options.steamid);
queues.summary.data(options.steamid).depth = 0;
queues.summary.run();

process.on("exit", function on_exit() {
    console.log(JSON.stringify(player_datas, null, options.pretty ? "    " : null));
});