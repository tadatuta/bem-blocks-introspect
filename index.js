var fs = require('fs'),
    Valkyrie = require('valkyrie');

Valkyrie(['.'], { scheme: 'flat' })
    .get({ tech: 'blocks' }, 'path', onGotLevels);

function onGotLevels(levels) {
    getBlocksFiles(levels);
    getExamplesFiles(levels);
}

function getBlocksFiles(levels) {
    var blocks = {};

    Valkyrie(levels.filter(function(level) { return level !== 'test.blocks'; }))
        .on('*', function(block) {
            var blockName = block.entity.block;

            blocks[blockName] || (blocks[blockName] = []);
            blocks[blockName].push(block);
        })
        .on('end', function() {
            fs.writeFileSync('blocks.json', JSON.stringify(blocks, null, 4));
        });
}

function getExamplesFiles(levels) {
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
                        examplesToScan.length || fs.writeFileSync('examples.json', JSON.stringify(blocks, null, 4));
                    })
            });
    })
}

