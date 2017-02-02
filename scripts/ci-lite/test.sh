set -ex -o pipefail

cd `dirname $0`
cd ../..

npm test
