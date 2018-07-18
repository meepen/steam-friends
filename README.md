## steam-friends
gather info about friends on steam, recursively

## usage
To use, run `node steam-friends <steamid> [options] > output.json`

### Optional arguments
- `depth` - chooses how many time to recurse into friends lists (number, default 1)
- `bans` - adds ban info to the output
- `games` - adds played games to the output
- `pretty` - pretty prints the output