const path = require('path');

process.env.FONTCONFIG_PATH = path.join(process.cwd(), 'social', 'fonts');

const sharp = require('sharp');

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="250">
  <rect width="100%" height="100%" fill="white"/>
  <text x="20" y="100" font-family="Inter" font-size="70" fill="black">
    ABC abc
  </text>
  <text x="20" y="190" font-family="Inter" font-size="70" fill="black">
    ÁÉŐÚÜŰ áéőúüű
  </text>
</svg>
`;

sharp(Buffer.from(svg))
  .png()
  .toFile('font-diagnostic.png')
  .then(() => console.log('font-diagnostic.png CREATED'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
