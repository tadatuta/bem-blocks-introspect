var fs = require('fs'),
    path = require('path'),
    mkdir = require('mkdirp'),
    Valkyrie = require('bem-valkyrie');

module.exports = function(libFolder, config) {
    config || (config = require('./configs/default'));

    var levelsToScan = [libFolder],
        designFolder = path.join(libFolder, 'design'),
        outputFolder = config.outputFolder || libFolder;

    fs.existsSync(designFolder) && levelsToScan.push(designFolder);

    // TODO: необходимо добавлять (и потом отличать) уровни библиотек-зависимостей

    return new Promise(function(resolve, reject) {

        Valkyrie(levelsToScan, { scheme: 'flat' })
            .get({ tech: 'blocks' }, 'path', onGotLevels);

        function onGotLevels(levels) {
            var sets = config.sets;

            // костыль для папки blocks
            fs.existsSync(path.join(libFolder, 'blocks')) && levels.unshift(path.join(libFolder, 'blocks'));

            Promise.all(Object.keys(sets).map(function(set) {
                var pathToSet = path.join(outputFolder, set);

                mkdir.sync(pathToSet + '.docs');

                var setLevels = levels.filter(function(level) {
                    return sets[set].some(function(lvl) {
                        return level.indexOf(lvl) > -1 || path.basename(level) === 'blocks';
                    });
                });

                return Promise.all([
                    getBlocksFiles(setLevels, pathToSet),
                    getExamplesFiles(setLevels, pathToSet)
                ]);
            }))
            .then(function(setsIntrospectionFiles) {
                resolve(setsIntrospectionFiles.reduce(function(acc, set) {
                    set.forEach(function(setTaskData) {
                        Object.assign(acc.sets, setTaskData.sets);
                    });

                    return acc;
                }, { sets: {} }));
            })
            .catch(reject);
        }

    });
}

function getBlocksFiles(levels, set) {
    var blocks = {};

    return new Promise(function(resolve, reject) {
        Valkyrie(levels.filter(function(level) { return level !== 'test.blocks'; }))
            .on('*', function(block) {
                var blockName = block.entity.block;

                blocks[blockName] || (blocks[blockName] = []);
                blocks[blockName].push(block);
            })
            .on('end', function() {
                var createdFiles = {
                    sets: {}
                };

                Object.keys(blocks).forEach(function(block) {
                    var folder = path.join(set + '.docs', block),
                        pathToFile = path.join(folder, block + '.source-files.json');

                    mkdir.sync(folder);

                    fs.writeFileSync(pathToFile, JSON.stringify(blocks[block], null, 4));
                    createdFiles.sets[set] || (createdFiles.sets[set] = { blocks: {} });
                    createdFiles.sets[set].blocks[block] || (createdFiles.sets[set].blocks[block] = {});
                    createdFiles.sets[set].blocks[block].source = pathToFile;
                });

                resolve(createdFiles);
            })
            .on('error', reject);
    });
}

function getExamplesFiles(levels, set) {
    var blocks = {},
        examplesToScan = [],
        createdFiles = {
            sets: {}
        };

    return new Promise(function(resolve, reject) {
        var hasExamples = false;

        Valkyrie(levels)
            .on({ tech: 'examples' }, function(blockWithExamples) {
                hasExamples = true;

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

                                if (!examplesToScan.length) {
                                    Object.keys(blocks).forEach(function(block) {
                                        var folder = path.join(set + '.docs', block),
                                            pathToFile = path.join(folder, block + '.examples-files.json');

                                        mkdir.sync(folder);

                                        fs.writeFileSync(pathToFile, JSON.stringify(blocks[block], null, 4));
                                        createdFiles.sets[set] || (createdFiles.sets[set] = { blocks: {} });
                                        createdFiles.sets[set].blocks[block] || (createdFiles.sets[set].blocks[block] = {});
                                        createdFiles.sets[set].blocks[block].examples = pathToFile;
                                    });

                                    resolve(createdFiles);
                                }
                            })
                            .on('error', reject);
                    })
                    .on('error', reject);
            })
            .on('end', function() {
                if (!hasExamples) resolve({});
            })
            .on('error', reject);
    });
}
