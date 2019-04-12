/*
  Copyright: (c) 2019, Guilherme Francescon Cittolin <gfcittolin@gmail.com>
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

function crc16(b){
    let sum, i, j, m, lll;
    lll = 0xcf87;
    sum = 0x7e;
    for (j = 2; j <= b.length; j++) {
        for (m = 0; m <= 7; m++) {
            if ((lll & 0x8000) != 0) {
                lll = lll ^ 0x8408;
                lll = lll << 1;
                lll = lll + 1;
            } else {
                lll = lll << 1;
            }
        }
        sum = sum ^ lll;
    }
    for (j = 0; j < b.length; j++) {
        sum = sum ^ b[j];
        for (i = 0; i <= 7; i++) {
            if (sum & 0x01) {
                sum = sum >> 1;
                sum = sum ^ 0x8408;
            } else {
                sum = sum >> 1;
            }
        }
    }
    return sum;
}

module.exports = {
    crc16
};