## steam-friends
gather info about friends on steam, recursively

## installation
To install, run `npm install -g steam-friends`

## usage
To use, run `steam-friends <steamid> --key <key> [options] > output.json`

### required arguments
- `key` - a web api key from https://steamcommunity.com/dev/apikey

### optional arguments
- `depth` - chooses how many time to recurse into friends lists (number, default 1)
- `bans` - adds ban info to the output
- `games` - adds played games to the output
- `pretty` - pretty prints the output