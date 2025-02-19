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

import { Tail } from '../../sub/lizard.js';
import { DB, DIC, runAs, getTheme, getMission, getThemeWords, getRandom,
    getPenalty, getPreScore, toRegex, ROBOT_START_DELAY, ROBOT_TYPE_COEF,
    ROBOT_THINK_COEF, ROBOT_HIT_LIMIT, ROBOT_LENGTH_LIMIT } from './_common.js';

export function getTitle () {
    let R = new Tail();
    let my = this;

    setTimeout(function () {
        R.go("①②③④⑤⑥⑦⑧⑨⑩");
    }, 500);
    return R;
}
export function roundReady () {
    let my = this;

    clearTimeout(my.game.turnTimer);
    my.game.round++;
    my.game.roundTime = my.time * 1000;
    if (my.game.round <= my.round) {
        my.game.theme = getTheme.call(my);
        my.game.chain = [];
        if (my.opts.mission) my.game.mission = getMission(my.rule.lang, my.opts.tactical);
        my.byMaster('roundReady', {
            round: my.game.round,
            theme: my.game.theme,
            mission: my.game.mission
        }, true);
        my.game.turnTimer = setTimeout(runAs, 2400, my, my.turnStart);
    } else {
        my.roundEnd();
    }
}
export function turnStart (force) {
    let my = this;
    let speed;
    let si;

    if (!my.game.chain) return;
    my.game.roundTime = Math.min(my.game.roundTime, Math.max(10000, 150000 - my.game.chain.length * 1500));
    speed = my.getTurnSpeed(my.game.roundTime);
    clearTimeout(my.game.turnTimer);
    clearTimeout(my.game.robotTimer);
    my.game.late = false;
    my.game.turnTime = 15000 - 1400 * speed;
    my.game.turnAt = (new Date()).getTime();
    if (my.opts.mission && my.opts.randmission) my.game.mission = getMission(my.rule.lang, my.opts.tactical);
    my.byMaster('turnStart', {
        turn: my.game.turn,
        speed: speed,
        roundTime: my.game.roundTime,
        turnTime: my.game.turnTime,
        mission: my.game.mission,
        seq: force ? my.game.seq : undefined
    }, true);
    my.game.turnTimer = setTimeout(runAs, Math.min(my.game.roundTime, my.game.turnTime + 100), my, my.turnEnd);
    if (si = my.game.seq[my.game.turn]) if (si.robot) {
        my.readyRobot(si);
    }
}
export function turnEnd () {
    let my = this;
    let target = DIC[my.game.seq[my.game.turn]] || my.game.seq[my.game.turn];
    let score;

    if (my.game.loading) {
        my.game.turnTimer = setTimeout(runAs, 100, my, my.turnEnd);
        return;
    }
    if (!my.game.chain) return;

    my.game.late = true;
    if (target) if (target.game) {
        score = getPenalty(my.game.chain, target.game.score);
        target.game.score += score;
    }
    let words = getThemeWords.call(my, my.game.theme);
    let w = getRandom(words);
    my.byMaster('turnEnd', {
        ok: false,
        target: target ? target.id : null,
        score: score,
        hint: w
    }, true);
    my.game._rrt = setTimeout(runAs, 3000, my, my.roundReady);
    clearTimeout(my.game.robotTimer);
}
export function submit (client, text, data) {
    let score, l, t;
    let my = this;
    let tv = (new Date()).getTime();
    let mgt = my.game.seq[my.game.turn];

    if (!mgt) return;
    if (!mgt.robot) if (mgt != client.id) return;
    if (!my.game.theme) return;
    if (my.game.chain.indexOf(text) == -1) {
        l = my.rule.lang;
        my.game.loading = true;

        function onDB($doc) {
            function preApproved() {
                if (my.game.late) return;
                if (!my.game.chain) return;

                my.game.loading = false;
                my.game.late = true;
                clearTimeout(my.game.turnTimer);
                t = tv - my.game.turnAt;
                score = my.getScore(text, t);
                my.game.chain.push(text);
                my.game.roundTime -= t;
                client.game.score += score;
                client.publish('turnEnd', {
                    ok: true,
                    value: text,
                    mean: $doc.mean,
                    theme: $doc.theme,
                    wc: $doc.type,
                    score: score,
                    bonus: (my.game.mission === true) ? score - my.getScore(text, t, true) : 0,
                    baby: $doc.baby
                }, true);
                if (my.game.mission === true) {
                    my.game.mission = getMission(my.rule.lang, my.opts.tactical);
                }
                setTimeout(runAs, my.game.turnTime / 6, my, my.turnNext);
                if (!client.robot) {
                    client.invokeWordPiece(text, 1);
                    if (client.game.wpe !== undefined && $doc && my.wpeCheck(my.rule.lang, $doc.theme))
                        client.invokeEventPiece(text, 1);
                    DB.kkutu[l].update(['_id', text]).set(['hit', $doc.hit + 1]).on();
                }
            }

            function denied(code) {
                my.game.loading = false;
                client.publish('turnError', {code: code || 404, value: text}, true);
            }

            if ($doc) {
                if ($doc.theme.match(toRegex(my.game.theme)) == null) denied(407);
                else preApproved();
            } else {
                denied();
            }
        }

        DB.kkutu[l].findOne(['_id', text]).on(onDB);
    } else {
        client.publish('turnError', {code: 409, value: text}, true);
    }
}
export function getScore (text, delay, ignoreMission) {
    let my = this;
    let tr = 1 - delay / my.game.turnTime;
    let score = getPreScore(text, my.game.chain, tr);
    let arr;

    if (!ignoreMission) if (arr = text.match(new RegExp(my.game.mission, "g"))) {
        score += score * 0.5 * arr.length;
        my.game.mission = true;
    }
    return Math.round(score);
}
export function readyRobot (robot) {
    let my = this;
    let level = robot.level;
    let delay = ROBOT_START_DELAY[level];
    let hitLim = Math.floor(ROBOT_HIT_LIMIT[level] / 2);
    let word, text;
    let list = getThemeWords.call(my, my.game.theme)
    
    if (list.length) {
        let highestHit = 0;
        for (word of list) {
            if (highestHit < word.hit) highestHit = word.hit;
            if (highestHit >= hitLim) break;
        }
        // 봇 설정 - 단어대결은 제한이 절반이다.
        if (hitLim > highestHit) denied();
        else pickList(list);
    } else denied();

    function denied() {
        text = "... T.T";
        after();
    }

    function pickList(list) {
        let target, diff;
        if (list) {
        for (word of list) {
                if (word._id.length > ROBOT_LENGTH_LIMIT[level]) continue;
                if (hitLim > word.hit) continue;
                if (my.game.chain.includes(word._id)) continue;
                if (!target || target._id.length <= word._id.length) {
                    // if (firstMove && word._id.length > 15) continue; // 단어대결에서는 첫턴 글자수 제한 구현 안됨
                    if (target) diff = target._id.length - word._id.length;
                    else diff = 99;
                    if (diff == 0) {
                        // 같은 길이의 단어면 1/16으로 단어를 바꿈
                        if (Math.random() * 16 >= 1)
                            continue;
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

    function after() {
        delay += text.length * ROBOT_TYPE_COEF[level];
        setTimeout(runAs, delay, my, my.turnRobot, robot, text);
    }
}
