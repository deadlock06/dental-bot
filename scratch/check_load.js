try {
  console.log('Testing require("../growth/index")...');
  require('../growth/index');
  console.log('Success!');
} catch (err) {
  console.error('FAILED to require growth/index');
  console.error(err);
  process.exit(1);
}
