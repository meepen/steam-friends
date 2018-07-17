const queue = require("./queue");

module.exports.IURLQueue = class IURLQueue {
    constructor(wait_for) {
        this.items = [];
        this.wait_for = wait_for || 0;
    }

    build_url(items) {
        throw new Error("not implemented: build_url");
    }

    push(item) {
        this.items.push(item);
        if (this.items.length > this.wait_for) {
            this.run();
        }
    }

    at_max() {
        return this.items.length >= this.wait_for;
    }
    
    run() {
        if (this.items.length === 0)
            return false;
        let items = this.items.splice(0, this.wait_for);
        queue.get(this.build_url(items), (err, res) => {
            this.callback_internal(items, err, res);
        });
        return true;
    }

    callback_internal(items, err, res) {
        if (err)
            throw err;
        
        this.callback(items, res);
        this.try_continue();
    }

    callback(items, res) {
        throw new Error("not implemented: callback");
    }
}