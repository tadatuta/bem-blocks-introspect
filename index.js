var config = {
    sets: {
        desktop : ['common', 'desktop'],
        touch : ['common', 'touch']
    }
};

var fs = require('fs'),
    path = require('path'),
    mkdir = require('mkdirp'),
    Valkyrie = require('valkyrie');

Valkyrie(['.'], { scheme: 'flat' })
    .get({ tech: 'blocks' }, 'path', onGotLevels);

function onGotLevels(levels) {
    var sets = config.sets;

    Object.keys(sets).forEach(function(set) {
        mkdir.sync(set + '.docs');

        var setLevels = levels.filter(function(level) {
            var levelName = level.split('.')[0];

            return sets[set].indexOf(levelName) > -1;
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
                    })
            });
    })
}

