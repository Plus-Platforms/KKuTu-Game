/**
 * Rule the words! KKuTu Online
 * Copyright (C) 2017 JJoriping(op@jjo.kr)
 * Copyright (C) 2017 KKuTuIO(admin@kkutu.io)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
export let reloads = {}

function getJson (name) {
    return JSON.parse(readFileSync(`${__dirname}/config/${name}`, 'utf8'));
}

/*---- api ----*/
export let CAPTCHA_TO_GUEST;
export let CAPTCHA_TO_USER;
export let CAPTCHA_SITE_KEY;
export let CAPTCHA_SECRET_KEY;
export let DISCORD_WEBHOOK;
reloads.api = () => {
    ({
        CAPTCHA_TO_GUEST,
        CAPTCHA_TO_USER,
        CAPTCHA_SITE_KEY,
        CAPTCHA_SECRET_KEY,
        DISCORD_WEBHOOK
    } = getJson('api.json'));
}
reloads.api();

/*---- automod ----*/
export let CHAT_SPAM_ADD_DELAY;   //이 시간보다 빨리 치면 도배 카운트 증가
export let CHAT_SPAM_CLEAR_DELAY; //이 시간 이후 치면 도배 카운트 초기화
export let CHAT_SPAM_LIMIT;       //이 횟수 이상 도배 카운트 올라가면 차단
export let CHAT_BLOCKED_LENGTH;   //차단됐을 시 이 시간 이후 치면 차단 해제
export let CHAT_KICK_BY_SPAM;     //차단됐을 시 이 횟수 이상 치면 강제퇴장
export let SPAM_CLEAR_DELAY;
export let SPAM_ADD_DELAY;
export let SPAM_LIMIT;
export let BLOCKED_LENGTH;
export let KICK_BY_SPAM;

reloads.automod = () => {
    ({
        CHAT_SPAM_ADD_DELAY,
        CHAT_SPAM_CLEAR_DELAY,
        CHAT_SPAM_LIMIT,
        CHAT_BLOCKED_LENGTH,
        CHAT_KICK_BY_SPAM,
        SPAM_CLEAR_DELAY,
        SPAM_ADD_DELAY,
        SPAM_LIMIT,
        BLOCKED_LENGTH,
        KICK_BY_SPAM
    } = getJson('automod.json'));
}
reloads.automod();



/*---- event ----*/
const DAY = 86400000; // 시간 계산용 하루 길이

/* 기존 컨픽 데이터
// 테스트용, 켜두면 관리자는 항상 이벤트 조각을 얻을 수 있음
export let EVENT_FORCE_FOR_ADMIN;

// 이벤트 기간
export let EVENT_START;
export let EVENT_UNTIL;
export let EVENT_EXPIRE_AT;
export let EVENT_ID;

// 이벤트 종류별 세부 설정
export let EVENT_WORDPIECE;
export let EVENT_POINT;
export let EVENT_ITEMPIECE;
export let EVENT_SUPPORT;
*/

export let EVENTS;
export let EXCHANGEABLES = {};

reloads.event = () => {
    /* 기존 데이터
    let STARTING_YEAR;
    let STARTING_MONTH;
    let STARTING_DATE;
    let STARTING_HOUR;
    let EVENT_DURATION; // 이벤트 시작 ~ 드랍 비활성화 일수
    let EVENT_EXPIRE; // 드랍 비활성화 시점 ~ 만료일 일수
    ({
        STARTING_YEAR,
        STARTING_MONTH,
        STARTING_DATE,
        STARTING_HOUR,
        EVENT_ID,
        EVENT_FORCE_FOR_ADMIN,
        EVENT_DURATION,
        EVENT_EXPIRE,
        EVENT_WORDPIECE,
        EVENT_POINT,
        EVENT_ITEMPIECE,
        EVENT_SUPPORT
    } = getJson('event.json'));
    */
    EVENTS = getJson('event.json');

    for (let event of EVENTS) {
        let STARTING_YEAR;
        let STARTING_MONTH;
        let STARTING_DATE;
        let STARTING_HOUR;
        let EVENT_DURATION; // 이벤트 시작 ~ 드랍 비활성화 일수
        let EVENT_EXPIRE; // 드랍 비활성화 시점 ~ 만료일 일수

        ({
            STARTING_YEAR,
            STARTING_MONTH,
            STARTING_DATE,
            STARTING_HOUR,
            EVENT_DURATION,
            EVENT_EXPIRE,
        } = event)

        EVENT_DURATION = EVENT_DURATION || 7;
        EVENT_EXPIRE = EVENT_EXPIRE || 14;

            // 이벤트 글자조각 드랍 시작 / 종료 / 기간 만료 계산
        event.EVENT_START = new Date(STARTING_YEAR, STARTING_MONTH - 1, STARTING_DATE, STARTING_HOUR).getTime();
        event.EVENT_UNTIL = event.EVENT_START + (DAY * EVENT_DURATION);
        event.EVENT_EXPIRE_AT = Math.floor((event.EVENT_UNTIL + (DAY * EVENT_EXPIRE)) / 1000);
        event.EVENT_ID = event.EVENT_ID || "event." + Math.floor(event.EVENT_START / 1000); // 자동지정일때

        if (event.hasOwnProperty("EVENT_POINT"))
            event.EVENT_POINT.REWARD_BORDER = Object.keys(event.EVENT_POINT.REWARD_AMOUNT).map(v => parseInt(v)).sort((a,b) => a-b);
        if (event.hasOwnProperty("EVENT_ITEMPIECE")) {
            event.EVENT_ITEMPIECE.PIECE_LIST = Object.keys(event.EVENT_ITEMPIECE.PIECE_POOL);
            event.EVENT_ITEMPIECE.REWARD_BORDER = Object.keys(event.EVENT_ITEMPIECE.REWARD_AMOUNT).map(v => parseInt(v)).sort((a,b) => a-b);
            let auto = 0;
            for (let k in event.EVENT_ITEMPIECE.EXCHANGE) {
                if (event.EVENT_ITEMPIECE.EXCHANGE[k].id) continue;
                event.EVENT_ITEMPIECE.EXCHANGE[k].id = "exchange." + (auto++)
            }
            EXCHANGEABLES[event.EVENT_ID] = event.EVENT_ITEMPIECE.EXCHANGE;
        } else {
            EXCHANGEABLES[event.EVENT_ID] = [];
        }
    }
    /* 자동변환, 시스템 개편으로 사용하지 않음
    let from, to, newData;
    for (from of EVENT_ITEMPIECE.PIECE_LIST) {
        for (to of EVENT_ITEMPIECE.PIECE_LIST) {
            if (from == to) continue;
            newData = {
                "itemName": to,
                "requiredItems": {},
                "stockLimit": 0,
                "buyLimit": 0,
                "eventPoint": 0,
                "isConvert": true
            }
            newData.requiredItems[from] = EVENT_ITEMPIECE.CONVERT_AMOUNT;
            EVENT_ITEMPIECE.EXCHANGE.push(newData)
        }
    }
    */
}
reloads.event();



/*---- generic ----*/
export let ADMIN;
export let TESTER;
export let KKUTU_MAX;
export let MAX_OBSERVER;
export let EQUIP_GROUP;
export let EQUIP_SLOTS;
export let UID_ALPHABET;
export let UID_LETTER;
export let UID_IMPORT_LETTER;

reloads.generic = () => {
    ({
        ADMIN,
        TESTER,
        KKUTU_MAX,
        MAX_OBSERVER,
        EQUIP_GROUP,
        UID_ALPHABET,
        UID_LETTER,
        UID_IMPORT_LETTER
    } = getJson('generic.json'));
    TESTER = ADMIN.concat(TESTER);
    EQUIP_SLOTS = Object.keys(EQUIP_GROUP);
}
reloads.generic();



/*---- network ----*/
export const {
    PG_USER, PG_PASS, PG_PORT, PG_DB,
    MAIN_PORTS, TEST_PORT,
    WEB_KEY, CRYPTO_KEY,
    IS_WS_SECURED, WS_SSL_OPTIONS
} = getJson('network.json');



/*---- rule ----*/
export let OPTIONS;
export let RULE;
export let GAME_TYPE;
reloads.rule = () => {
    ({
        OPTIONS,
        RULE
    } = getJson('rule.json'));
    GAME_TYPE = Object.keys(RULE);
}
reloads.rule();



/*---- word ----*/
export let EXAMPLE_TITLE;
export let MISSION;
export let MISSION_TACT;
export let THEME;
export let INJEONG;
export let IJP_EXCEPT;
export let IJP;
reloads.word = () => {
    let LANG;
    ({
        LANG,
        EXAMPLE_TITLE,
        MISSION,
        MISSION_TACT,
        THEME,
        INJEONG,
        IJP_EXCEPT
    } = getJson('word.json'));
    IJP = {};
    for (let l of LANG) {
        MISSION[l] = MISSION[l].split('');
        MISSION_TACT[l] = MISSION_TACT[l].split('');
        IJP[l] = INJEONG[l].concat(THEME[l]).filter(function (item) {
            return !IJP_EXCEPT.includes(item);
        });
    }
}
reloads.word();