const axios = require("axios");

const wait_time_ms = 1250;
const retries = 3;

let queue = module.exports;

let q = [],
    token;


const get_timeout = function get_timeout(prev) {
    let data = prev || q.pop();

    debug(`GET ${data[0]}`);

    axios.get(data[0]).then(res => {
        data[1](null, res.data);

        token = undefined;

        if (q.length > 0) 
            token = setTimeout(get_timeout, wait_time_ms);
    }).catch(e => {
        if (!prev || prev[2]++ > retries) {
            token = setTimeout(get_timeout, wait_time_ms, data);
            debug("retrying previous url...");
            return;
        }
        data[1](e, null);

        token = undefined;

        if (q.length > 0) 
            token = setTimeout(get_timeout, wait_time_ms);
    });
}


queue.get = function get(url, fn) {
    q.push([url, fn, 0]);
    if (!token)
        token = setTimeout(get_timeout, wait_time_ms);
}