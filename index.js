const config = require("./config");
const IURLQueue = require("./urlqueue").IURLQueue;

let options_required = {
    depth: {
        default: 1
    }
};

let options = {
    steamid: process.argv[2]
};

for (let option in options_required) {
    options[option] = options_required[option].default;
}

for (let i = 3; i < process.argv.length; i++) {
    let option = process.argv[i];
    if (option.slice(0, 2) != "--")
        throw new Error(`option ${option} not valid`);

    if (!options_required[option.slice(2)])
        throw new Error(`no such option: ${option}`);
    
    options[option.slice(2)] = process.argv[++i];
}

for (let option in options_required)
    if (options[option] == undefined)
        options[option] = options_required[option].default;


let key_regex = new RegExp(config.key, "g");
global.debug = function debug(a) {
    process.stderr.write(`${a.replace(key_regex, "<key>")}\n`);
};

debug(options.depth);

let queues = {};
let player_datas = {
    /* "steamid": {
        steamid: "",
        displayname: "",
        vac_bans: 0,
        game_bans: 0,
        games_played: [], 
        countrycode: "",
        visibleprofile: false,
        profilesetup: false,
        lastlogoff: 0,
        createdat: 0,
        lastbanat: 0,
        friends: []
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

    if (queues.bans.run())
        return;

    if (queues.summary.run())
        return;
}

const player_data = function player_data(steamid) {
    if (undefined === player_datas[steamid])
        player_datas[steamid] = {
            steamid: steamid,
            _need_bans: true,
            _need_friends: true,
            _need_games: true,
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
        return `http://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${config.key}&steamid=${items[0]}&relationship=friend`
    }

    callback(items, res) {
        let friends = JSON.parse(res.body).friendslist.friends;
        let data = this.data(items[0]);

        data.friends = {}; // steamid: since;

        delete data._need_friends;
        for (let friend of friends) {
            data.friends[friend.steamid] = friend.friend_since;
            if (player_datas[friend.steamid])
                continue;

            queues.summary.push(friend.steamid, (data.depth || 0) + 1);
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
        return `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${config.key}&steamids=${items.map(d => d.steamid).join(",")}`;
    }

    callback(items, res) {
        let struct = JSON.parse(res.body);

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

                queues.friends.push(data.steamid);
                queues.games.push(data.steamid);
            } else {
                delete data._need_friends;
                delete data._need_games;
            }

            queues.bans.push(data.steamid);
        }
    };
}

class BanURLQueue extends IFriendFinderQueue {
    constructor() {
        super(100);
    }

    build_url(items) {
        return `http://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${config.key}&steamids=${items.join(",")}`;
    }

    callback(items, res) {
        let struct = JSON.parse(res.body);

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
        return `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${config.key}&steamid=${items[0]}&include_played_free_games=true&format=json`;
    }
    
    callback(items, res) {
        let struct = JSON.parse(res.body).response;
        let data = this.data(items[0]);
        
        data.games_played = struct.games;

        delete data._need_games;
        this.update(items[0]);
    }
}

queues.friends = new FriendsURLQueue();
queues.summary = new SummaryURLQueue();
queues.bans = new BanURLQueue();
queues.games = new GamesURLQueue();


queues.summary.push(options.steamid);
queues.summary.run();

process.on("exit", function on_exit() {
    console.log(JSON.stringify(player_datas, null, "    "));
});