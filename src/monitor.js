const Apify = require('apify');
const yaml = require('yaml');

const { utils: { log } } = Apify;
const DEFAULT_STATS = {
    ok: 0,
    failed: 0,
    denied: 0,
    skipped: 0,
    products: 0,
    productsDone: 0,
    productsDonePerSubcategory: {},
    invalidOutput: 0,
    emptyList: 0,
    duplicities: 0,
    reviews: 0,
    questionAndAnswers: 0,
    requestsPerLabel: {},
};

const Monitor = class Monitor {
    async init(customStats = {}) {
        const stats = await Apify.getValue('STATS');
        if (stats) {
            this.stats = stats;
            return;
        }
        const defaultDatasetInfo = await Apify.openDataset().then((r) => r.getInfo());
        const datasetAttributes = {
            datasetDate: defaultDatasetInfo.createdAt.toISOString(),
            defaultDatasetId: defaultDatasetInfo.id,
        };
        this.stats = { ...DEFAULT_STATS, ...customStats, ...datasetAttributes };
        // this.stats = (await Apify.getValue('STATS')) || { ...DEFAULT_STATS, ...customStats, ...datasetAttributes };
    }

    async printStats() {
        const total = this.stats.ok + this.stats.denied;
        const blockRatio = total > 0 ? (this.stats.denied / total) * 100 : 0;

        const statsEntries = Object.entries(this.stats);
        const statBlocks = [Object.fromEntries(statsEntries.filter((it) => typeof it[1] !== 'object'))];
        statBlocks.push(...statsEntries.filter((it) => typeof it[1] === 'object' && Object.values(it[1]).length > 0).map((it) => Object.fromEntries([it])));

        log.info(`[MONITOR]\n\n  ${statBlocks.map((it) => yaml.stringify(it)).join('\n').replace(/\n/g, '\n  ')}`);

        log.info(`[BLOCK RATIO] ${blockRatio.toFixed(2)}%`);
    }

    async persistState() {
        await Promise.all([
            this.saveStats(),
            this.saveDetails(),
            this.printStats(),
        ]);
    }

    async saveStats() {
        await Apify.setValue('STATS', this.stats).then(() => log.info('Local key value store STATS saved'));
    }

    async saveDetails() {
        await Apify.setValue('DETAILS', {
            itemsCount: this.stats.productsDone,
            reviewsCount: this.stats.reviews,
            questionsAndAnswersCount: this.stats.questionAndAnswers,
            datasetName: this.stats.datasetName,
            datasetDate: this.stats.datasetDate,
            defaultDatasetId: this.stats.defaultDatasetId,
        }).then(() => log.info('Local key value store DETAILS saved'));
    }

    // denied requests
    addDenied() {
        this.stats.denied++;
    }

    // failed requests
    addFailed() {
        this.stats.failed++;
    }

    // skipped requests
    addSkipped() {
        this.stats.skipped++;
    }

    // successful requests
    addOk() {
        this.stats.ok++;
    }

    // processed request labels
    addRequestsPerLabel(label, add = 1) {
        this.stats.requestsPerLabel[label] = this.getRequestsPerLabel(label) + add;
    }

    addProducts(add = 1) {
        this.stats.products += add;
    }

    addProductsDone(add = 1) {
        this.stats.productsDone += add;
    }

    addProductsDonePerSubcategory(category, subcategory, add = 1) {
        this.stats.productsDonePerSubcategory[`${category} > ${subcategory}`] = this.getProductsDonePerSubcategory(category, subcategory) + add;
    }

    addInvalidOutput(add = 1) {
        this.stats.invalidOutput += add;
    }

    addEmptyList() {
        this.stats.emptyList++;
    }

    addDuplicities() {
        this.stats.duplicities++;
    }

    getRequestsPerLabel(label) {
        return this.stats.requestsPerLabel[label] || 0;
    }

    getProductsDonePerSubcategory(category, subcategory) {
        return this.stats.productsDonePerSubcategory[`${category} > ${subcategory}`] || 0;
    }

    getCustomStatValue(stat) {
        return this.stats[stat];
    }

    setCustomStatValue(stat, value) {
        this.stats[stat] = value;
    }

    addReviews(add = 1) {
        this.stats.reviews += add;
    }

    addQuestionAndAnswers(add = 1) {
        this.stats.questionAndAnswers += add;
    }
};

module.exports = Monitor;
