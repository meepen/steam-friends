const request = require("request");

let queue = module.exports;

let q = [],
    token;


const get_timeout = function get_timeout() {
    let data = q.pop();

    debug(`GET ${data[0]}`);

    request.get(data[0], (err, res) => {
        data[1](err, res);

        token = undefined;

        if (q.length > 0) 
            token = setTimeout(get_timeout, 1100);
    });
}


queue.get = function get(url, fn) {
    q.push([url, fn]);
    if (!token)
        token = setTimeout(get_timeout, 1100);
}