/**
 * Plan cache commands
 * 
 * Cache-wide Commands
 * - planCacheListKeys
 * - planCacheClear
 *
 * Query-specific Commands
 * - planCacheGenerateKey
 * - planCacheGet
 * - planCacheDrop
 * - planCacheListPlans
 * - planCachePinPlan
 * - planCacheUnpinPlan
 * - planCacheAddPlan
 * - planCacheShunPlan
 */ 

var t = db.jstests_query_cache;

t.drop();

t.save({a: 1});

t.ensureIndex({a: 1});

var queryA1 = {a: 1};
var sortA1 = {a: -1};
assert.eq(1, t.find(queryA1).sort(sortA1).itcount(), 'unexpected document count');



//
// Tests for planCacheGenerateKey
//

// Utility function to generate cache key.
function generateKey(cmdObj) {
    var res = t.runCommand('planCacheGenerateKey', cmdObj);
    print('planCacheGenerateKey(' + tojson(cmdObj, '', true) + ') = ' + tojson(res));
    assert.commandWorked(res, 'planCacheGenerateKey failed for ' + tojson(cmdObj, '', true));
    assert(res.hasOwnProperty('key'), 'key missing from planCacheGenerateKey(' +
           tojson(cmdObj, '', true) + ') result');
    assert.neq(null, res.key, 'null key returned by planCacheGenerateKey(' +
            tojson(cmdObj, '', true) + ')');
    return res.key;
}

//Invalid sort
assert.commandFailed(t.runCommand('planCacheGenerateKey', {query: {}, sort: {a: 'foo'}}));

// Valid query {a: 1} should return a non-empty cache key.
var keyA1 = generateKey({query: queryA1, sort: sortA1, projection: {}});



//
// tests for planCacheListKeys
// Returns a list of keys for the queries currently cached in the collection.
//

// Utility function to list keys in cache.
function getKeys() {
    var res = t.runCommand('planCacheListKeys');
    print('planCacheListKeys() = ' + tojson(res));
    assert.commandWorked(res, 'planCacheListKeys failed');
    assert(res.hasOwnProperty('queries'), 'queries missing from planCacheListKeys result');
    return res.queries;
    
}
// Attempting to retrieve cache information on non-existent collection
// is an error.
var missingCollection = db.jstests_query_cache_missing;
missingCollection.drop();
assert.commandFailed(missingCollection.runCommand('planCacheListKeys'));

// Retrieve cache keys from the test collection
// Number of keys should match number of indexed queries executed so far
var keys = getKeys();
assert.eq(1, keys.length, 'unexpected number of keys in planCacheListKeys result');
assert.eq(keyA1, keys[0], 'unexpected cache key returned from planCacheListKeys');



//
// Tests for planCacheGet
//

// Invalid key should result in an error.
assert.commandFailed(t.runCommand('planCacheGet', {key: 'unknownquery'}));

// Get details on a query. This does not include plans.
// XXX: Add checks on query, sort and projection fields in result.
var res = t.runCommand('planCacheGet', {key: keyA1});
print('planCacheGet({key: ' + tojson(keyA1) + ') = ' + tojson(res));
assert.commandWorked(res, 'planCacheGet failed');
assert.eq(queryA1, res.query, 'query in planCacheGetResult does not match initial query filter');
assert.eq(sortA1, res.sort, 'sort in planCacheGetResult does not match initial sort order');
assert(res.hasOwnProperty('projection'), 'projection missing from planCacheGet result');



//
// Tests for planCacheDrop
//

// Invalid key should be an error.
assert.commandFailed(t.runCommand('planCacheDrop', {key: 'unknownquery'}));

// Run a new query shape and drop it from the cache
assert.eq(0, t.find({a: 1, b: 1}).itcount(), 'unexpected document count');
var keyA1B1 = generateKey({query: {a: 1, b: 1}, sort: {}, projection: {}});
assert.eq(2, getKeys().length, 'unexpected cache size after running 2nd query');
assert.commandWorked(t.runCommand('planCacheDrop', {key: keyA1B1}));
assert.eq(1, getKeys().length, 'unexpected cache size after dropping 2nd query from cache');



//
// Tests for planCacheListPlans
//

// Utility function to list plans for a query.
function getPlans(key) {
    var res = t.runCommand('planCacheListPlans', {key: key});
    assert.commandWorked(res, 'planCacheListPlans(' + tojson(key, '', true) + ' failed');
    assert(res.hasOwnProperty('plans'), 'plans missing from planCacheListPlans(' +
           tojson(key, '', true) + ') result');
    return res.plans;
}

// Invalid key should be an error.
assert.commandFailed(t.runCommand('planCacheListPlans', {key: 'unknownquery'}));

// Retrieve plans for valid cache entry.
var plans = getPlans(keyA1);
assert.eq(2, plans.length, 'unexpected number of plans cached for query');



//
// Tests for planCachePinPlan
//

// Invalid key should be an error.
assert.commandFailed(t.runCommand('planCachePinPlan', {key: 'unknownquery', plan: 'plan1'}));

// Plan ID has to be provided.
assert.commandFailed(t.runCommand('planCachePinPlan', {key: keyA1}));

// XXX: Pinning plan is no-op for now.
res = t.runCommand('planCachePinPlan', {key: keyA1, plan: 'plan0'});
assert.commandWorked(res, 'planCachePinPlan failed');



//
// Tests for planCacheUnpinPlan
//

// Invalid key should be an error.
assert.commandFailed(t.runCommand('planCacheUnpinPlan', {key: 'unknownquery'}));

// XXX: Unpinning plan is no-op for now.
res = t.runCommand('planCacheUnpinPlan', {key: keyA1});
assert.commandWorked(res, 'planCacheUnpinPlan failed');



//
// Tests for planCacheAddPlan
//

// Invalid key should be an error.
assert.commandFailed(t.runCommand('planCacheAddPlan', {key: 'unknownquery', details: {}}));

// Plan details must to be provided.
assert.commandFailed(t.runCommand('planCacheAddPlan', {key: keyA1}));

// XXX: Adding a plan is not very meaningful at the moment. Merely increments
// numPlans inside cache entry.
// Returns ID of added plan.
var numPlansBeforeAdd = getPlans(keyA1).length;
res = t.runCommand('planCacheAddPlan', {key: keyA1, details: {}});
assert.commandWorked(res, 'planCacheAddPlan failed');
print('planCacheAddPlan results = ' + tojson(res));
assert(res.hasOwnProperty('plan'), 'plan missing from planCacheAddPlan result');
var numPlansAfterAdd = getPlans(keyA1).length;
assert.eq(numPlansBeforeAdd + 1, numPlansAfterAdd, 'number of plans cached unchanged');
var planAdded = res.plan;



//
// Tests for planCacheShunPlan
//

// Invalid key should be an error.
assert.commandFailed(t.runCommand('planCacheShunPlan', {key: 'unknownquery', plan: planAdded}));

// Plan must to be provided.
assert.commandFailed(t.runCommand('planCacheShunPlan', {key: keyA1}));

// Invalid plan is not acceptable.
assert.commandFailed(t.runCommand('planCacheShunPlan', {key: keyA1, plan: 'bogusplan'}));

// XXX: Shunning plan is not very meaningful at the moment. Merely decrements
// numPlans inside cache entry.
var numPlansBeforeShun = getPlans(keyA1).length;
res = t.runCommand('planCacheShunPlan', {key: keyA1, plan: planAdded});
assert.commandWorked(res, 'planCacheShunPlan failed');
var numPlansAfterShun = getPlans(keyA1).length;
assert.eq(numPlansBeforeShun - 1, numPlansAfterShun, 'number of plans cached unchanged');



//
// Tests for planCacheClear
//

// Drop query cache. This clears all cached queries in the collection.
// XXX: Shunning a query should mark it as sunned in planCacheListPlans, not
// remove it. Revisit when we have real cached solutions.
res = t.runCommand('planCacheClear');
print('planCacheClear() = ' + tojson(res));
assert.commandWorked(res, 'planCacheClear failed');
res = t.runCommand('planCacheListKeys');
assert.commandWorked(res, 'planCacheListKeys failed');
assert.eq(0, res.queries.length, 'plan cache should be empty after successful planCacheClear()');

