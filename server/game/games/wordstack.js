/**
 * WordStack Project
 * Copyright (C) 2022 Koko Ayame(preta@siro.dev)
 * 
 * Based on KKuTu Online
 * Copyright (C) 2017 JJoriping(op@jjo.kr)
 * Copyright (C) 2017 KKuTuIO(admin@kkutu.io)
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Tail, all as LizardAll } from '../../sub/lizard.js';
import { DB, DIC, runAs, getChar, getSubChar, getPreScore, getMission, getRandom,
    getWordList, ROBOT_START_DELAY, ROBOT_HIT_LIMIT, ROBOT_LENGTH_LIMIT,
    ROBOT_THINK_COEF, ROBOT_TYPE_COEF, KOR_FLAG, KOR_STRICT, KOR_GROUP,
    ENG_ID } from './_common.js';

let WISH_WORD_CACHE = {'ko': {}, 'en': {}};

export function getTitle (){
    let R = new Tail();
    let my = this;
    let l = my.rule;

    if(!l){
        R.go("undefinedd");
        return R;
    }

    DB.kkutu[my.rule.lang].find([ '_id', /^.{3}$/ ]).limit(416).on(function($res){
        pick($res.map(function(item){ return item._id; }));
    });

    function pick(list){
        my.game.charpool = [];
        if(my.game.seq) {
            let len = my.game.seq.length * 3;

            for(let j = 0; j < len; j++){
                my.game.charpool = my.game.charpool.concat(getRandom(list).split(""));
            }
        }
    }
    
    setTimeout(function(){
        R.go("①②③④⑤⑥⑦⑧⑨⑩");
    }, 500);
    return R;
}

export function roundReady (){
    let my = this;
    
    my.game.round++;
    my.game.roundTime = my.time * 1000;
    if (my.game.round <= my.round) {
        my.game.chain = {};
        my.game.pool = {};
        my.game.dic = {};
        my.game.timer = {};
        my.game.penalty = {};
        my.game.bonus = {};

        if (my.opts.mission) my.game.mission = getMission(my.rule.lang, my.opts.tactical);
        for (let k in my.game.seq) {
            let o = my.game.seq[k]
            let t = o.robot ? o.id : o;
            my.game.chain[t] = [];
            my.game.pool[t] = [];
            for(let i = 0; i < 5; i++) {
                my.game.pool[t].push(getRandom(my.game.charpool))
            }
            if (my.game.timer[t]) clearInterval(my.game.timer[t]);
            my.game.timer[t] = 0;
            my.game.penalty[t] = false;
            my.game.bonus[t] = 0;
        }
        let subPool = {};
        for (let i in my.game.pool) {
            subPool[i] = getSubpool.call(my, my.game.pool[i]);
        }

        my.byMaster('roundReady', {
            round: my.game.round,
            pool: my.game.pool, // TODO: 클라이언트에서는 자신의 풀 데이터만 볼 수 있도록
            subpool: subPool,
        }, true);
        setTimeout(runAs, 2400, my, my.turnStart);
    } else {
        my.roundEnd();
    }
}

export function turnStart (){
    let my = this;

    my.game.late = false;
    my.game.qTimer = setTimeout(runAs, my.game.roundTime, my, my.turnEnd);
    my.byMaster('turnStart', { roundTime: my.game.roundTime }, true);
    for(let i in my.game.robots){
        my.readyRobot(my.game.robots[i]);
    }
}

export function turnEnd (){
    let my = this;
    let score;
    
    if(!my.game.seq) return;
    
    if(my.game.loading){
        my.game.turnTimer = setTimeout(runAs, 100, my, my.turnEnd);
        return;
    }
    my.game.late = true;
    my.byMaster('turnEnd', {
        ok: false
    }, true);
    my.game._rrt = setTimeout(runAs, (my.game.round == my.round) ? 3000 : 10000, my, my.roundReady);
    clearTimeout(my.game.robotTimer);
    for (let k in my.game.seq) {
        let o = my.game.seq[k]
        let t = o.robot ? o.id : o;

        if (my.game.timer[t]) clearInterval(my.game.timer[t])
        my.game.timer[t] = 0;
    }
}

function applyBonus(client, isPenalty){
    let my = this;
    let clientId = client.robot ? client.id : client;

    if (my.game.late) {
        if (my.game.timer[clientId]) clearInterval(my.game.timer[clientId]);
        my.game.timer[clientId] = 0;
    }
    let preScore = client.game.score;
    let score = (isPenalty ? -10 : 10) + Math.floor(Math.random()*6);
    if (!isPenalty && my.game.bonus) {
        if(!my.game.bonus[clientId]) my.game.bonus[clientId] = 0;
        if(my.game.bonus[clientId] < 10) {
            score = Math.round(score * (1 - (my.game.bonus[clientId] * 0.1)));
            my.game.bonus[clientId]++;
        } else score = 0;
    }
    client.game.score += score;
    if (client.game.score < 0) {
        score = -preScore;
        client.game.score = 0;
    }
    if (score !== 0) client.publish('turnEnd', {
        ok: !isPenalty,
        target: client.id,
        score: score,
        isBonus: true
    }, true);
}

export function submit (client, text){
    let score, l, t;
    let my = this;
    let tv = (new Date()).getTime();
    
    if (!my.game.pool) return;
    if (!my.game.pool.hasOwnProperty(client.id)) return client.chat(text);
    
    if(!isChainable(text, my.game.pool[client.id])) return client.chat(text);
    if(my.game.chain[client.id].indexOf(text) != -1) return client.send('turnError', { code: 409, value: text }, true);
    
    l = my.rule.lang;
    my.game.loading = true;
    function onDB($doc){
        if(!my.game.chain[client.id]) return;
        let preChar = getChar.call(my, text);
        let preSubChar = getSubChar.call(my, preChar);
        
        function preApproved(){
            function approved(){
                if(my.game.late) return;
                if(!my.game.chain[client.id]) return;
                if(!my.game.dic) return;
                
                my.game.loading = false;
                // my.game.late = true;
                clearTimeout(my.game.turnTimer);
                t = tv - my.game.turnAt;
                score = my.getScore.call(my, text, t, client.id);
                my.game.dic[text] = (my.game.dic[text] || 0) + 1;
                my.game.chain[client.id].push(text);
                let pool = my.game.pool[client.id];
                let seq = my.game.seq;
                let others = [];
                for (let c of seq) { // 사실 반드시 돌아가야한다
                    if (c.robot) {
                        if (c.id == client.id) continue;
                        others.push([c.id, c]);
                        continue;
                    } else if (c == client.id) continue;
                    others.push([c, DIC[c]]);
                }
                let [other, otherClient] = getRandom(others);
                let otherpool = my.game.pool[other]
                otherpool.push(preChar);
                my.game.roundTime -= t;

                let pidx = getPoolIndex(text.charAt());
                if (pidx == -1) return;
                pool.splice(pidx, 1)

                client.game.score += score;
                client.publish('turnEnd', {
                    ok: true,
                    target: client.id,
                    value: text,
                    mean: $doc.mean,
                    theme: $doc.theme,
                    wc: $doc.type,
                    score: score,
                    bonus: (my.game.mission === client.id) ? score - my.getScore.call(my, text, t, client.id, true) : 0,
                    baby: $doc.baby,
                    pool: pool, // 공격자가 가지고 있는 글자
                    subpool: getSubpool.call(my, pool),
                    attack: other,
                    otherpool: otherpool, // 방어자가 가지고 있는 글자
                    othersub: getSubpool.call(my, otherpool)
                });
                if(my.game.mission === client.id) {
                    my.game.mission = getMission(my.rule.lang);
                }

                if (pool.length <= 0 && !my.game.timer[client.id]) {
                    my.game.timer[client.id] = setInterval(runAs, 1000, my, applyBonus, client);
                    my.game.penalty[client.id] = false;
                } else if (pool.length <= 8 && my.game.timer[client.id] && my.game.penalty[client.id]) {
                    clearInterval(my.game.timer[client.id]);
                    my.game.timer[client.id] = 0;
                }

                if (otherpool.length > 8 && !my.game.timer[other]) {
                    my.game.timer[other] = setInterval(runAs, 1000, my, applyBonus, otherClient, true);
                    my.game.penalty[other] = true;
                } else if (otherpool.length > 0 && my.game.timer[other] && !my.game.penalty[other]) {
                    clearInterval(my.game.timer[other]);
                    my.game.timer[other] = 0;
                }

                // setTimeout(runAs, my.game.turnTime / 6, my, my.turnNext);
                if(!client.robot){
                    client.invokeWordPiece(text, 1);
                    if (client.game.wpe !== undefined && $doc && my.wpeCheck(my.rule.lang, $doc.theme))
                        client.invokeEventPiece(text, 1);
                    DB.kkutu[l].update([ '_id', text ]).set([ 'hit', $doc.hit + 1 ]).on();
                }
            }
            let deniedWith = 0;
            do {
                if(my.opts.manner) {
                    let count = getWordList.call(my, preChar, preSubChar).length
                    if (!count) {
                        deniedWith = 403;
                        break;
                    }
                }
            } while (false)

            if (deniedWith) {
                my.game.loading = false;
                client.send('turnError', { code: deniedWith, value: text });
            } else approved();
        }
        function denied(code){
            my.game.loading = false;
            client.send('turnError', { code: code || 404, value: text });
        }
        if($doc){
            if(!my.opts.injeong && ($doc.flag & KOR_FLAG.INJEONG)) denied();
            else if(my.opts.strict && (!$doc.type.match(KOR_STRICT) || $doc.flag >= 4)) denied(406);
            else if(my.opts.loanword && ($doc.flag & KOR_FLAG.LOANWORD)) denied(405);
            else preApproved();
        }else{
            denied();
        }
    }
    function isChainable(text, pool){
        if(!text) return false;
        if(text.length <= 1) return false;

        let char = [];
        for (let c of pool) {
            char.push(c);
            let sub = getSubChar.call(my, c);
            if (sub) char.push(sub);
        }

        return char.indexOf(text[0]) != -1;
    }

    function getPoolIndex(char){
        if(!char) return false;

        let pool = my.game.pool[client.id];
        for (let i in pool) {
            if (pool[i] == char) return i;
            let sub = getSubChar.call(my, pool[i]);
            if (sub == char) return i;
        }
        return -1;
    }

    if (DB.SUBMIT_WORD_CACHE[l].hasOwnProperty(text)) {
        onDB(DB.SUBMIT_WORD_CACHE[l][text]);
    } else {
        onDB(null);
    }
}

export function getScore (text, delay, ignoreMission, clientId) {
    let my = this;
    let tr = 1 //1 - delay / my.game.turnTime; // 시간 소모량 계산 어떻게 할지 정해야함
    let score, arr;

    if (!text || !my.game.chain || !my.game.dic) return 0;
    score = getPreScore(text, my.game.chain[clientId], tr);

    if (my.game.dic[text]) score *= 15 / (my.game.dic[text] + 15);
    
    if (!ignoreMission && my.game.mission && my.game.mission.length == 1) if (arr = text.match(new RegExp(my.game.mission, "g"))) {
        score += score * 0.5 * arr.length;
        my.game.mission = clientId;
    }
    return Math.round(score);
}

export function readyRobot (robot){
    let my = this;
    let level = robot.level;
    let delay = ROBOT_START_DELAY[level] + 1000;
    if (my.game.late) return;
    if (!my.game.pool) return;

    let pool = my.game.pool[robot.id];
    if (!pool.length) {
        setTimeout(runAs, delay, my, my.readyRobot, robot);
        return;
    }
    let chain = my.game.chain[robot.id];

    let ended = {};
    let word, text, i, c;
    let lmax;

    let targetChar = getRandom(pool);
    let subChar = getSubChar.call(my, targetChar);

    let list = getWordList.call(my, targetChar, subChar, true);
    if(list.length){
        let highestHit = 0;
        for (word of list) {
            if (highestHit < word.hit) highestHit = word.hit;
            if (ROBOT_HIT_LIMIT[level] >= highestHit) break;
        }
        if (ROBOT_HIT_LIMIT[level] > highestHit) denied();
        else{
            if(level >= 3 && !chain.length) {
                let longestLen = 0;
                for (word of list) {
                    if (longestLen < word._id.length) longestLen = word._id.length
                    if (longestLen >= 8) break;
                }
                if (longestLen < 8 && my.game.turnTime >= 2300) {
                    for (word of list) {
                        c = word._id.charAt(my.opts.reverse ? 0 : (word._id.length - 1));
                        if (!ended.hasOwnProperty(c)) ended[c] = [];
                        ended[c].push(word);
                    }
                    getWishList(Object.keys(ended)).then(function(key){
                        let v = ended[key];
                        
                        if(!v) denied();
                        else pickList(v);
                    });
                }else{
                    pickList(list);
                }
            }else pickList(list);
        }
    }else denied();
    function denied(){
        text = `${targetChar}... T.T`;
        after();
    }
    function pickList(list) {
        let target;
        let diff;
        if (list) {
            for (word of list) {
                if (word._id.length > ROBOT_LENGTH_LIMIT[level]) continue;
                if (ROBOT_HIT_LIMIT[level] > word.hit) continue;
                if (chain.includes(word._id)) continue;
                if (!target || target._id.length <= word._id.length) {
                    if (target) diff = target._id.length - word._id.length;
                    else diff = 99;
                    if (diff == 0) {
                        // 같은 길이의 단어면 1/16으로 단어를 바꿈
                        if (Math.random() * 16 >= 1)
                            continue
                    } else if (diff <= 5) {
                        // 단어 길이 차가 적으면 1/(8-차이)로 단어 변경 안함
                        if (Math.random() * (8 - diff) < 1)
                            continue;
                    }
                    target = word;
                    // 1/16으로 더 긴 단어를 찾지 않고 그대로 입력
                    if (Math.random() * 16 < 1) break;
                }
            }
        }
        if (target) {
            text = target._id;
            delay += 500 * ROBOT_THINK_COEF[level] * Math.random() / Math.log(1.1 + target.hit);
            after();
        } else denied();
    }
    function after(){
        delay += text.length * ROBOT_TYPE_COEF[level];
        // my.game.chain[client.id].push(text);
        setTimeout(runAs, delay, my, my.turnRobot, robot, text);
        setTimeout(runAs, delay, my, my.readyRobot, robot);
    }
    function getWishList(list){
        let R = new Tail();
        let wz = [];
        let res;
        
        for(let i in list) wz.push(getWish(list[i]));
        LizardAll(wz).then(function($res){
            if(!my.game.chain[robot.id]) return;
            $res.sort(function(a, b){ return a.length - b.length; });
            
            if(my.opts.manner || !my.game.chain[robot.id].length){
                while(res = $res.shift()) if(res.length) break;
            }else res = $res.shift();
            R.go(res ? res.char : null);
        });
        return R;
    }
    function getWish(char){
        let R = new Tail();
        let len, list;
        
        if (WISH_WORD_CACHE[my.rule.lang].hasOwnProperty(char)) {
            R.go({char: char, length: WISH_WORD_CACHE[my.rule.lang][char]});
        } else {
            list = getWordList.call(my, char, true);
            len = list.length > 10 ? 10 : list.legnth;
            WISH_WORD_CACHE[my.rule.lang][char] = len;
            R.go({char: char, length: len});
        }

        return R;
    }
}

function getSubpool(pool) {
    return pool.map((char) => {
        return getSubChar.call(this, char);
    });
}