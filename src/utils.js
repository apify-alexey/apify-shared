const Apify = require('apify');
const { webalize } = require('webalize');
const { format, startOfDay, addDays, addMonths, parse: parseDate, parseISO, isValid } = require('date-fns');
const { DATE_FORMAT } = require('./consts');

const { utils: { log } } = Apify;

/**
 * Return default formatted date 7 days past
 * @return {string}
 * @param { Object || null } options
 * @param {number || null} options.daysMinus
 * @param {number || null} options.monthMinus
 */
const getReviewsDateFromWithDefaultStringFormat = (options = {}) => {
    const { daysMinus = 7, monthMinus = null } = options;
    const today = new Date();
    let past = startOfDay(addDays(startOfDay(today), -daysMinus));
    if (monthMinus) {
        past = startOfDay(addMonths(startOfDay(today), -monthMinus));
    }
    return format(past, DATE_FORMAT);
};

// Lukas: No idea why we decided to work in seconds instead of milliseconds which is standard unix timestamp
// Now we have to always print with * 1000 but too late to change

/**
 * Return timestamp of the date
 * Supported formats are yyyy-MM-dd and ISO
 * @param dateString
 * @return {number}
 */
const getMinimumTimestamp = (dateString) => {
    const shortDate = parseDate(dateString, DATE_FORMAT, new Date());
    if (isValid(shortDate)) {
        return Math.floor(shortDate.getTime() / 1000);
    }

    const isoDate = parseISO(dateString);
    return Math.floor(isoDate.getTime() / 1000);
};


/**
 * Return formatted default date string
 * @param date
 * @return {string}
 */
const getDateStringFormat = (date = new Date()) => {
    return format(date, DATE_FORMAT);
};

/**
 * Lukas: Newer and correct version of isReviewDateValid
 * The original one did compare just full days which we cannot do to distinguish already scraped reviews
 * Keeping the original one around though because it is used extensively in the code
 */
const isReviewDateValidFullTimestamp = (reviewDateISO, minimumTimestamp) => {
    if (!reviewDateISO) {
        return false;
    }
    return (startOfDay(parseISO(reviewDateISO)).getTime() / 1000 - minimumTimestamp > 0);
};

/**
 * READ THE isReviewDateValidFullTimestamp comment before using this
 * Check if review date is valid - if the date is younger than
 * @param reviewDate
 * @param minimumTimestamp
 * @return {boolean}
 */
const isReviewDateValid = (reviewDate, minimumTimestamp) => {
    if (!reviewDate) {
        return false;
    }
    return (startOfDay(reviewDate).getTime() / 1000 - minimumTimestamp >= 0);
};
/**
 * Wait for random time between input params
 * @param min
 * @param max
 * @return {Promise<void>}
 */
// eslint-disable-next-line default-param-last
const humanSleep = async (min = 400, max) => {
    await Apify.utils.sleep(humanDelay(min, max || min * 2));
};

/**
 * Return random number between given min max
 * @param min
 * @param max
 * @return {number}
 */
const humanDelay = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Transform text to the web accepted string
 * @param text
 * @return {string}
 */
const webalizeString = (text) => {
    return webalize(text);
};

/**
 * Open KeyValueStore for product ids to check if we must scrape reviews/Q&A two years back or just 7 days
 * @param keyValueStoreName name of the KV store in Apify platform
 * @return {Promise<{storedIdsData: ({[p: string]: any}|Buffer|string|*[]), keyValueStore: import("apify").KeyValueStore}>}
 */
const openKeyValueForStoredProductIds = async (keyValueStoreName) => {
    /** @type { import("apify").KeyValueStore } KeyValueStore */
    const keyValueStore = await Apify.openKeyValueStore(keyValueStoreName);
    const storedIdsData = (await keyValueStore.getValue('stored-ids')) || [];
    return { keyValueStore, storedIdsData };
};

/**
 * Check if product is already stored or not
 * @param {number} id
 * @param storedIdsData {import("apify").KeyValueStore}
 * @return {boolean}
 */
const isIdAlreadyStored = (id, storedIdsData) => {
    return !!storedIdsData.has(id);
};

/**
 * add product id to the KV store
 * @param {number} id
 * @param storedIdsData {import("apify").KeyValueStore}
 */
const addStoredProduct = (id, storedIdsData) => {
    storedIdsData.add(id);
};

const createRouter = (routes, globalContext = {}) => {
    return async function (routeName, requestContext) {
        const route = routes[routeName];
        if (!route) throw new Error(`No route for name: ${routeName}`);
        return route(requestContext, globalContext);
    };
};

const autoScroll = async (page) => {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const timer = setInterval(() => {
                const minDistance = 200;
                const maxDistance = 500;
                const distance = Math.floor(Math.random() * (maxDistance - minDistance + 1)) + maxDistance;
                const { scrollHeight } = document.body;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 500);
        });
    });
};

const validateOutput = (productData) => {
    const errors = [];
    const mainKeys = ['retailerName', 'market', 'site', 'details', 'reviews', 'questionsAndAnswers'];

    errors.push(validateKeys('root', mainKeys, Object.keys(productData)));
    errors.push(validateValues('root', productData));

    const detailsKeys = ['productName', 'category', 'subcategory', 'brand', 'retailerProductCode', 'upc',
        'manufacturer', 'productUrl', 'numberOfReviews', 'rating', 'aboutThisItem', 'additionalProductDescription',
        'ingredients', 'productImageUrl', 'dateFirstAvailable', 'dateAddedToCatalog'];
    const minDetailsKeys = ['productName', 'productUrl', 'numberOfReviews', 'rating'];

    const detailsKeysForCheck = Object.keys(productData.details);

    if (detailsKeysForCheck.length <= minDetailsKeys.length) {
        errors.push(validateKeys('details', minDetailsKeys, detailsKeysForCheck));
    } else {
        errors.push(validateKeys('details', detailsKeys, detailsKeysForCheck));
    }
    errors.push(validateValues('details', productData.details));

    const reviewKeys = ['internalReviewId', 'retailerReviewId', 'reviewDate', 'reviewDateISO', 'rating', 'reviewTitle', 'reviewText',
        'parentOrChild', 'reviewUrl', 'reviewType', 'verifiedPurchase', 'helpfulReviewCount', 'reviewCustomerImages'];

    if (productData?.reviews?.constructor === Array) {
        for (const review of productData.reviews) {
            if (!validateKeys('review', reviewKeys, Object.keys(review))) {
                errors.push(false);
                break;
            }
            errors.push(validateValues('review', review));
        }
    }

    const questionKeys = ['questionId', 'questionUrl', 'questionDate', 'questionDateISO', 'question', 'answers'];
    const answerKeys = ['answerId', 'answerDate', 'answer'];

    if (productData?.questionsAndAnswers?.constructor === Array) {
        for (const question of productData.questionsAndAnswers) {
            if (!validateKeys('questionsAndAnswers', questionKeys, Object.keys(question))) {
                errors.push(false);
                break;
            }
            errors.push(validateValues('question', question));

            if (question?.answers?.constructor === Array) {
                for (const answer of question.answers) {
                    if (!validateKeys('questionsAndAnswers.answer', answerKeys, Object.keys(answer))) {
                        errors.push(false);
                        break;
                    }
                    errors.push(validateValues('answer', answer));
                }
            }
        }
    }

    return errors.filter((isValid) => isValid === false).length === 0;
};

const validateKeys = (type, expectedKeys, dataKeys) => {
    const missingKeys = expectedKeys.filter((key) => !dataKeys.includes(key));
    const additionalKeys = dataKeys.filter((key) => !expectedKeys.includes(key));
    const errors = [];

    if (missingKeys.length > 0) {
        errors.push(`Missing keys: ${missingKeys.join(', ')}`);
    }
    if (additionalKeys.length > 0) {
        errors.push(`Additional keys: ${additionalKeys.join(', ')}`);
    }

    if (errors.length > 0) {
        log.error(`Invalid output format for "${type}" (${errors.join(', ')})!`);
        return false;
    }

    return true;
};

const validateValues = (type, object) => {
    let errors = 0;
    const keys = Object.keys(object);
    for (const key of keys) {
        const value = object[key];
        if (value === undefined || value === null) {
            log.error(`Invalid value null or undefined for key "${type}.${key}"!`);
            errors++;
        }
    }

    return errors === 0;
};

const sendEmailMessage = async (retailerName, env, categories) => {
    if (Apify.isAtHome()) {
        const pluralCategory = categories.length > 1 ? 'categories' : 'category';
        const message = 'Hello! <br /><br />'
            + `Scraping successfully finished for the retailer <b>${retailerName}</b> and ${pluralCategory}: <b>${categories.join(', ')}</b>.<br /><br />`
            + `Link to run: https://console.apify.com/view/runs/${env.actorRunId}<br />`
            + `Link to dataset: https://api.apify.com/v2/datasets/${env.defaultDatasetId}/items?clean=true&format=json<br />`
            + '<br /><br />Apify Robot';

        try {
            const run = await Apify.callTask('consumer-puls-insights/email-ntf', {
                subject: `Apify - Data ready for <b>${retailerName}</b> and ${pluralCategory}: <b>${categories.join(', ')}</b>`,
                html: message,
            }, { waitSecs: 0 });
            log.info(`Send Email actor started ${run.id}`);
        } catch (e) {
            log.error(e);
        }
    }
};

/**
 * @param datasetName
 * @param datasetDate
 * @returns {Promise<void>}
 */
const uploadDataToAzure = async (datasetName, datasetDate = new Date().toISOString().substring(0, 10)) => {
    if (Apify.isAtHome()) {
        try {
            await Apify.call('consumer-puls-insights/azure-uploader', {
                datasetId: process.env.APIFY_DEFAULT_DATASET_ID,
                datasetName,
                datasetDate,
            }, { token: process.env.APIFY_TOKEN });
        } catch (error) {
            // console.log(error);
            log.error(error);
        }
    }
};
    // checks dataset in the end of the run for at least one item
const checkDatasetForResult = async () => {
    const sourceDataset = await Apify.openDataset(); // default actor's dataset
    const sourceDatasetItems = await sourceDataset.getData({ limit: 1 });
    // if we have 0 results in the dataset, run should be marked as "failed".
    if (sourceDatasetItems.items.length === 0) {
        throw new Error('Run failed. The dataset is empty. Data wasn\'t uploaded to Azure.');
    }
};

module.exports = {
    getReviewsDateFromWithDefaultStringFormat,
    getMinimumTimestamp,
    getDateStringFormat,
    isReviewDateValidFullTimestamp,
    isReviewDateValid,
    humanSleep,
    humanDelay,
    webalizeString,
    openKeyValueForStoredProductIds,
    isIdAlreadyStored,
    addStoredProduct,
    createRouter,
    autoScroll,
    validateOutput,
    sendEmailMessage,
    uploadDataToAzure,
    checkDatasetForResult,
};
