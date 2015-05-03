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
    Valkyrie = require('valkyrie'),
    depsParser = require('bem-deps-parser');

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
        examplesDeps = {},
        examplesToScan = [];

    Valkyrie(levels).on({ tech: 'examples' }, function(blockWithExamples) {
        var blockWithExamplesName = blockWithExamples.entity.block;

        // TODO: check test.blocks by deps?
        Valkyrie([blockWithExamples.path], { scheme: 'flat' })
            .on({ tech: 'bemjson.js' }, function(bemjsonFileObj) {
                var exampleName = bemjsonFileObj.entity.block,
                    id = blockWithExamplesName + exampleName;

                examplesDeps[blockWithExamplesName] || (examplesDeps[blockWithExamplesName] = {});
                examplesDeps[blockWithExamplesName][exampleName] || (examplesDeps[blockWithExamplesName][exampleName] = []);

                examplesDeps[blockWithExamplesName][exampleName] = bemjsonFileObj;
            })
            .on('end', function() {
                Object.keys(examplesDeps).forEach(function(block) {
                    var folder = path.join(set + '.docs', block),
                        exampleDeps = examplesDeps[block],
                        totalExamples = exampleDeps.length;

                    mkdir.sync(folder);

                    // console.log('exampleDeps', exampleDeps);

                    Object.keys(exampleDeps).forEach(function(exampleName) {
                        var bemjsonFileObj = exampleDeps[exampleName],
                            bemjsonText = fs.readFileSync(bemjsonFileObj.path, 'utf8');
                        // TODO: parse as object
                        // bemjson = vm.runInContext(bemjsonText, vm.createContext());
                        depsParser(bemjsonText, function(deps) {
                            bemjsonFileObj.deps = util.inspect(deps, { depth: null });
                            totalExamples--;
                            totalExamples || fs.writeFileSync(path.join(folder, block + '.examples-deps.js'), JSON.stringify(exampleDeps, null, 4));
                        });
                    });
                });
            })
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
