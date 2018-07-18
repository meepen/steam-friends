const axios = require("axios");

let queue = module.exports;

let q = [],
    token;


const get_timeout = function get_timeout() {
    let data = q.pop();

    debug(`GET ${data[0]}`);

    axios.get(data[0]).then(res => {
        data[1](null, res.data);

        token = undefined;

        if (q.length > 0) 
            token = setTimeout(get_timeout, 1100);
    }).catch(e => {
        data[1](e, null);

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