var fs = require('fs'),
    path = require('path'),
    mkdir = require('mkdirp'),
    Valkyrie = require('valkyrie'),

    numberCallbacksToCall = 2;

module.exports = function(libFolder, config, cb) {

    if (typeof config === 'function') {
        cb = config;
    }

    if (!config || typeof config === 'function') {
        config = require('./configs/default');
    }

    var levelsToScan = [libFolder],
        designFolder = path.join(libFolder, 'design'),
        outputFolder = config.outputFolder || libFolder;

    fs.existsSync(designFolder) && levelsToScan.push(designFolder);

    // TODO: необходимо добавлять (и потом отличать) уровни библиотек-зависимостей

    Valkyrie(levelsToScan, { scheme: 'flat' })
        .get({ tech: 'blocks' }, 'path', onGotLevels);

    function onGotLevels(levels) {
        var sets = config.sets;

        // костыль для папки blocks
        fs.existsSync(path.join(libFolder, 'blocks')) && levels.unshift(path.join(libFolder, 'blocks'));

        Object.keys(sets).forEach(function(set) {
            var pathToSet = path.join(outputFolder, set);

            mkdir.sync(pathToSet + '.docs');

            var setLevels = levels.filter(function(level) {
                return sets[set].some(function(lvl) {
                    return level.indexOf(lvl) > -1 || path.basename(level) === 'blocks';
                });
            });

            getBlocksFiles(setLevels, pathToSet, tryToCallback);
            getExamplesFiles(setLevels, pathToSet, tryToCallback);
        });
    }

    function tryToCallback() {
        --numberCallbacksToCall;
        if (!numberCallbacksToCall) cb();
    }

}

function getBlocksFiles(levels, set, cb) {
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

            cb();
        });
}

function getExamplesFiles(levels, set, cb) {
    var blocks = {},
        examplesToScan = [];

    Valkyrie(levels)
        .on({ tech: 'examples' }, function(blockWithExamples) {
            ++numberCallbacksToCall;
            var blockWithExamplesName = blockWithExamples.entity.block;

            // TODO: check test.blocks by deps?
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

                            cb();
                        })
                });
        })
        .on('end', function() {
            cb();
        });
}
