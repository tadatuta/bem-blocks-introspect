var config = {
    sets: {
        desktop : ['common', 'desktop'],
        touch : ['common', 'touch']
    }
};

var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    vm = require('vm'),
    mkdir = require('mkdirp'),
    _ = require('lodash'),
    Valkyrie = require('valkyrie');

Valkyrie(['.', 'design'], { scheme: 'flat' })
    .get({ tech: 'blocks' }, 'path', onGotLevels);

function onGotLevels(levels) {
    var sets = config.sets;

    Object.keys(sets).forEach(function(set) {
        mkdir.sync(set + '.docs');

        var setLevels = levels.filter(function(level) {
            return sets[set].some(function(lvl) {
                return level.indexOf(lvl) > -1;
            });
        });

        getBlocksFiles(setLevels, set);
        getExamplesFiles(setLevels, set);
    });
}

function getBlocksFiles(levels, set) {
    var blocks = {};

    Valkyrie(levels.filter(function(level) { return level !== 'test.blocks'; }))
        .on('*', function(block) {
            var blockName = block.entity.block;

            blocks[blockName] || (blocks[blockName] = []);
            blocks[blockName].push(block);
        })
        .on('end', function() {
            Object.keys(blocks).forEach(function(block) {
                var folder = path.join(set + '.docs', block);
                mkdir.sync(folder);
                fs.writeFileSync(path.join(folder, block + '.source-files.json'), JSON.stringify(blocks[block], null, 4));
            });
        });
}

function getExamplesFiles(levels, set) {
    var blocks = {},
        examplesToScan = [];

    Valkyrie(levels).on({ tech: 'examples' }, function(blockWithExamples) {
        var blockWithExamplesName = blockWithExamples.entity.block;

        Valkyrie([blockWithExamples.path], { scheme: 'flat' })
            .on({ tech: 'blocks' }, function(example) {
                var exampleName = example.entity.block,
                    id = blockWithExamplesName + exampleName;

                examplesToScan.push(id);
                Valkyrie([example.path])
                    .on('*', function(file) {
                        blocks[blockWithExamplesName] || (blocks[blockWithExamplesName] = {});
                        blocks[blockWithExamplesName][exampleName] || (blocks[blockWithExamplesName][exampleName] = []);

                        blocks[blockWithExamplesName][exampleName].push(file);
                    })
                    .on('end', function() {
                        examplesToScan.splice(examplesToScan.indexOf(id), 1);
                        examplesToScan.length || Object.keys(blocks).forEach(function(block) {
                            var folder = path.join(set + '.docs', block);
                            mkdir.sync(folder);
                            fs.writeFileSync(path.join(folder, block + '.examples-files.json'), JSON.stringify(blocks[block], null, 4));
                        });
                    })
            });
    })
}

// Add deps data to *.docs/*/*.meta.json
// TODO: should be moved to enb-bem-docs
Valkyrie(['.'], { scheme: 'flat' }).get({ tech: 'docs' }, 'path', function(paths) {
    Valkyrie(paths).on({ tech: 'meta.json' }, function(meta) {
        var pathToMeta = path.resolve(meta.path),
            data = require(pathToMeta),
            examples = data.examples;

        examples.forEach(function(example) {
            var exampleDir,
                exampleName,
                source = example.source;

            if (!source) {
                exampleDir = example.path,
                exampleName = exampleDir.split('/').pop();

                source = fs.readFileSync(path.join(example.path, exampleName + '.bemjson.js'), 'utf8')
            }

            var ctx = vm.createContext(),
                bemjson = vm.runInContext(source[0] === '(' ? source : '(' + source + ')', ctx),
                deps = buildDeps(bemjson);

            example.deps = util.inspect(deps, { depth: null });

            fs.writeFileSync(pathToMeta, JSON.stringify(data, null, 4));
        });
    });
});

function buildDeps(bemjson) {
    return denormalizeDeps(filterDepsByOwnDeps(filterDepsByFs(iterateDeps(bemjson))));
}

function iterateDeps(bemjson, ctx) {
    ctx = ctx || {};

    var deps = [],
        contentDeps;

    if (Array.isArray(bemjson)) {
        bemjson.forEach(function(item) {
            contentDeps = iterateDeps(item, ctx);
            contentDeps && (deps = deps.concat(contentDeps));
        });

        return deps;
    }

    bemjson.block && (ctx.block = bemjson.block);

    var depItem = {
        block: ctx.block
    };

    bemjson.elem && (depItem.elem = bemjson.elem);
    bemjson.mods && (depItem.mods = bemjson.mods);
    bemjson.elemMods && (depItem.elemMods = bemjson.elemMods);

    deps.push(depItem);

    bemjson.mix && (deps = deps.concat(iterateDeps(bemjson.mix, ctx)));

    bemjson.content && (deps = deps.concat(iterateDeps(bemjson.content, ctx)));

    return deps;
}

function filterDepsByFs(deps) {
    // TODO: implement
    return deps;
}

function filterDepsByOwnDeps(deps) {
    // TODO: implement
    return deps;
}

function denormalizeDeps(deps) {
    var denormalizedDeps = [];

    deps.forEach(function(item) {
        var blockIdx = findIndexByName(denormalizedDeps, 'block', item.block);
        if (!blockIdx) return denormalizedDeps.push(item);

        var currentBlockItem = denormalizedDeps[blockIdx];

        if (item.elem) {
            delete item.block;

            if (!currentBlockItem.elems) {
                currentBlockItem.elems = [item.elem];
            } else {
                var idx = findIndexByName(currentBlockItem.elems, 'elem', item.elem);

                if (!idx) {
                    currentBlockItem.elems.push(item);
                } else if (item.mods || item.elemMods) {
                    var currentBlockItemElem = currentBlockItem.elems[idx];
                    if (typeof currentBlockItemElem === 'string') {
                        currentBlockItem.elems[idx] = item;
                    } else {
                        currentBlockItem.elems[idx].mods = _.extend({}, currentBlockItem.elems[idx].mods, currentBlockItem.elems[idx].elemMods);
                        item.mods = _.extend(item.mods, item.elemMods);
                        mergeMods(currentBlockItem.elems[idx].mods, item.mods);
                    }
                }
            }
        } else if (item.mods) {
            if (currentBlockItem.mods) {
                mergeMods(currentBlockItem.mods, item.mods);
            } else {
                currentBlockItem.mods = item.mods;
            }
        }

    });

    denormalizedDeps.forEach(function(item, idx) {
        // { block: 'b1' } -> 'b1'
        if (Object.keys(item).length === 1) return denormalizedDeps[idx] = item.block;

        if (!item.elems) return;

        // { elem: 'e1' } -> ['e1']
        item.elems.forEach(function(elem, idx) {
            if (typeof elem === 'string') return;

            Object.keys(elem).length === 1 && (item.elems[idx] = elem.elem);
        });

        item.elems = _.unique(item.elems);
    });

    /*
    * Находит индекс { key: name } в массиве arr
    * arr может содержать элементы в формате { key: 'name' } и 'name'
    */
    function findIndexByName(arr, key, name) {
        for (var idx = 0; idx < arr.length; idx++) {
            var currentName = typeof arr[idx] === 'string' ?
                arr[idx] : arr[idx][key];

            if (name === currentName) return idx;
        }
    }

    /*
    * Меняет modsInto по ссылке, ничего не возвращает
    */
    function mergeMods(modsInto, modsToMerge) {
        Object.keys(modsToMerge).forEach(function(mod) {
            var modInto = modsInto[mod],
                modToMerge = modsToMerge[mod];

            if (!modInto) return modsInto[mod] = modToMerge;

            modsInto[mod] = _.unique([].concat(modToMerge, modInto));
        });
    }

    return denormalizedDeps;
}
