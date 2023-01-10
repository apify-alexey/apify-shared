const Apify = require('apify');

const { utils: { log } } = Apify;

const Cache = class Cache {
    async init() {
        this.cache = (await Apify.getValue('CACHE')) || {};
    }

    async persistState() {
        await this.saveCache();
    }

    async saveCache() {
        await Apify.setValue('CACHE', this.cache).then(() => log.debug('CACHE persisted'));
    }

    addProduct(id, { details = {}, reviews = [], questionsAndAnswers = [] }) {
        const productData = this.cache[id] || { details: {}, reviews: [], questionsAndAnswers: [] };

        productData.reviews.push(...reviews);
        productData.questionsAndAnswers.push(...questionsAndAnswers);

        this.cache[id] = {
            details: {
                ...productData.details,
                ...details,
            },
            reviews: productData.reviews,
            questionsAndAnswers: productData.questionsAndAnswers,
        };
    }

    getProduct(id) {
        return this.cache[id];
    }

    deleteProduct(id) {
        delete this.cache[id];
    }

    async deleteCache() {
        this.cache = {};
        await Apify.setValue('CACHE', this.cache).then(() => log.debug('CACHE deleted'));
    }
};

module.exports = Cache;
