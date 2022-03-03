

let domContentLoaded = false;

window.addEventListener('DOMContentLoaded', function() { domContentLoaded = true });

class AbstractMcVersionElement extends HTMLElement {
    constructor() {
        super();
        this._range = '*';
    }

    static observedAttributes = ['range'];

    attributeChangedCallback(attrName, oldValue, newValue) {
        if (attrName === 'range') {
            this._range = newValue;
        }
    }

    get range() {
        return this.getAttribute('range');
    }

    set range(v) {
        this.setAttribute('range', v);
    }

    parseRange() {
        let range = this._range.replace(/\s+/g, '');
        const parseExpression = function() {
            const terms = [parseTerm()];
            while (range.startsWith('||')) {
                range = range.slice(2);
                terms.push(parseTerm());
            }
            return terms;
        }
        const parseTerm = function() {
            const predicates = [parsePredicate()];
            while (range.startsWith('&&')) {
                range = range.slice(2);
                predicates.push(parsePredicate());
            }
            return predicates;
        }
        const parsePredicate = function() {
            let neg = false;
            while (range.startsWith('!')) {
                range = range.slice(1);
                neg = !neg;
            }
            if (neg) {
                return {op: '!', val: parsePredicate()};
            }
            if (range.startsWith('(')) {
                range = range.slice(1);
                const expr = parseExpression();
                if (!range.startsWith(')')) {
                    throw new Error('Expected \')\'');
                }
                range = range.slice(1);
                return {op: '(', val: expr};
            }
            if (range.startsWith('*')) {
                range = range.slice(1);
                return {op: '*'};
            }
            let op = '=';
            if (range.startsWith('=')) {
                range = range.slice(1);
            } else if (range.startsWith('<=')) {
                op = '<=';
                range = range.slice(2);
            } else if (range.startsWith('<')) {
                op = '<';
                range = range.slice(1);
            } else if (range.startsWith('>=')) {
                op = '>=';
                range = range.slice(2);
            } else if (range.startsWith('>')) {
                op = '>';
                range = range.slice(1);
            }
            let endVersion = 0;
            for (; endVersion < range.length; endVersion++) {
                if (range[endVersion] === '|' || range[endVersion] === '&' || range[endVersion] === ')') {
                    break;
                }
            }
            if (endVersion === 0) {
                throw new Error('Expected predicate');
            }
            const version = range.substring(0, endVersion);
            range = range.slice(endVersion);
            return {op: op, val: version};
        }

        try {
            const expression = parseExpression();
            if (range.length > 0) {
                throw new Error('Trailing characters in version expression');
            }
            return expression;
        } catch (err) {
            console.error('Version predicate parsing failed: ' + err);
            return null;
        }
    }

    parseSemver(ver) {
        const semverRegex = new RegExp('(\\d+)\\.(\\d+|x)(\\.(\\d+|x))?');
        const val = semverRegex.exec(ver);
        if (val === null) {
            return null;
        } else {
            return {major: +val[1], minor: val[2] === 'x' ? null : +val[2], patch: val[4] === undefined || val[4] === 'x' ? null : +val[4]};
        }
    }

    shouldBeVisible(selectedVersion, allVersions) {
        const selectedIndex = allVersions.findIndex(it => it.id === selectedVersion);

        const expression = this.parseRange();
        if (expression === null) {
            return true;
        }
        const parseSemver = this.parseSemver;

        const checkExpression = function(expr) {
            for (let i = 0; i < expr.length; i++) {
                const term = expr[i];
                let termSatisfied = true;
                for (let j = 0; j < term.length; j++) {
                    const predicate = term[j];
                    if (!checkPredicate(predicate)) {
                        termSatisfied = false;
                        break;
                    }
                }
                if (termSatisfied) {
                    return true;
                }
            }
            return false;
        }
        const checkPredicate = function(predicate) {
            switch (predicate.op) {
                case '(': return checkExpression(predicate.val);
                case '!': return !checkPredicate(predicate.val);
                case '*': return true;
            }
            let eqSatisfied;
            let ltSatisfied;
            let gtSatisfied;

            const semver = parseSemver(predicate.val);
            if (semver === null) {
                const index = allVersions.findIndex(it => it.id === predicate.val);
                if (index === -1) {
                    console.error('Unknown version ' + predicate.val);
                    return true;
                }
                eqSatisfied = selectedIndex === index;
                // inequalities reversed because version list is in reverse order
                ltSatisfied = selectedIndex > index;
                gtSatisfied = selectedIndex < index;
            } else {
                let baseVersionStr = semver.major + '.';
                if (semver.minor === null) {
                    baseVersionStr += '0';
                } else {
                    baseVersionStr += semver.minor;
                    if (semver.patch !== null && semver.patch !== 0) {
                        baseVersionStr += '.' + semver.patch;
                    }
                }
                const baseVersionIndex = allVersions.findIndex(it => it.id === baseVersionStr);
                if (baseVersionIndex === -1) {
                    eqSatisfied = false;
                    if (semver.major <= 0 || (semver.major === 1 && semver.minor < 0)) {
                        ltSatisfied = true;
                        gtSatisfied = false;
                    } else {
                        ltSatisfied = false;
                        gtSatisfied = true;
                    }
                } else {
                    let lessVersionIndex = baseVersionIndex + 1;
                    for (; lessVersionIndex < allVersions.length; lessVersionIndex++) {
                        if (parseSemver(allVersions[lessVersionIndex].id) !== null) {
                            break;
                        }
                    }
                    let greaterVersionIndex = baseVersionIndex - 1;
                    for (; greaterVersionIndex >= 0; greaterVersionIndex--) {
                        const greaterSemver = parseSemver(allVersions[greaterVersionIndex].id);
                        if (greaterSemver !== null) {
                            if (greaterSemver.major > semver.major) {
                                break;
                            }
                            if (semver.minor !== null && greaterSemver.minor > semver.minor) {
                                break;
                            }
                            if (semver.patch !== null && greaterSemver.patch !== null && greaterSemver.patch > semver.patch) {
                                break;
                            }
                        }
                    }
                    for (greaterVersionIndex++; greaterVersionIndex < allVersions.length; greaterVersionIndex++) {
                        if (parseSemver(allVersions[greaterVersionIndex].id) !== null) {
                            break;
                        }
                    }
                    greaterVersionIndex--;

                    ltSatisfied = selectedIndex >= lessVersionIndex;
                    gtSatisfied = selectedIndex <= greaterVersionIndex;
                    eqSatisfied = !ltSatisfied && !gtSatisfied;
                }
            }

            switch (predicate.op) {
                case '=': return eqSatisfied;
                case '>=': return gtSatisfied || eqSatisfied;
                case '>': return gtSatisfied;
                case '<=': return ltSatisfied || eqSatisfied;
                case '<': return ltSatisfied;
                default: throw new Error('unreachable');
            }
        }

        return checkExpression(expression);
    }

    updateVersionText(allVersions) {
        const versionBox = this.shadowRoot.getElementById('version-box');
        const friendlyRange = this.getFriendlyRange(allVersions) || '';
        versionBox.innerText = friendlyRange;
    }

    getFriendlyRange(allVersions) {
        const expression = this.parseRange();
        if (expression === null) {
            return null;
        }

        if (expression.length === 1 && expression[0].length === 1 && expression[0][0].op === '=') {
            return expression[0][0].val + ' only';
        }

        const parseSemver = this.parseSemver;

        const stringifyExpression = function(expr) {
            const realExpr = [];
            const visitExpr = function(anExpr) {
                for (let i = 0; i < anExpr.length; i++) {
                    const term = anExpr[i];
                    if (term.length === 1 && term[0].op === '(') {
                        visitExpr(term[0].val);
                    } else {
                        realExpr.push(term);
                    }
                }
            }
            visitExpr(expr);

            let applyDeMorgan = realExpr.length > 1;
            if (applyDeMorgan) {
                for (let i = 0; i < realExpr.length; i++) {
                    const term = realExpr[i];
                    if (term.length !== 1) {
                        applyDeMorgan = false;
                        break;
                    }
                    switch (term[0].op) {
                        case '*': return 'all versions';
                        case '(': case '=': case '!': applyDeMorgan = false; break;
                        case '>=': case '>': case '<=': case '<': break;
                        default: throw new Error('unreachable');
                    }
                    if (!applyDeMorgan) {
                        break;
                    }
                }
            }

            if (applyDeMorgan) {
                const term = [];
                for (let i = 0; i < realExpr.length; i++) {
                    const pred = realExpr[i][0];
                    switch (pred.op) {
                        case '>=': pred.op = '<'; break;
                        case '>': pred.op = '<='; break;
                        case '<=': pred.op = '>'; break;
                        case '<': pred.op = '>='; break;
                        default: throw new Error('unreachable');
                    }
                    term.push(pred);
                }
                return 'all versions except ' + stringifyTerm(term);
            }

            let result = '';
            for (let i = 0; i < realExpr.length; i++) {
                if (i !== 0) {
                    if (i === realExpr.length - 1) {
                        result += ' and ';
                    } else {
                        result += ', ';
                    }
                }
                result += stringifyTerm(realExpr[i]);
            }
            return result;
        }
        const stringifyTerm = function(term) {
            let greaterPred = null;
            let lessPred = null;
            let equalPred = null;
            const notPreds = [];
            const parenPreds = [];
            const visitTerm = function(aTerm) {
                for (let i = 0; i < aTerm.length; i++) {
                    const pred = aTerm[i];
                    switch (pred.op) {
                        case '*': allVersionsPred = true; break;
                        case '>': case '>=': greaterPred = pred; break;
                        case '<': case '<=': lessPred = pred; break;
                        case '=': equalPred = pred; break;
                        case '!': notPreds.push(pred); break;
                        case '(':
                            if (pred.val.length === 1) {
                                visitTerm(pred.val[0]);
                            } else {
                                parenPreds.push(pred);
                            }
                            break;
                        default: throw new Error('unreachable');
                    }
                }
            }
            visitTerm(term);

            let result = '';
            if (equalPred !== null) {
                result = equalPred.val;
            } else if (lessPred !== null && greaterPred !== null) {
                if (lessPred.op === '<=' && greaterPred.op === '>=') {
                    result = 'between ' + greaterPred.val + ' and ' + lessPred.val;
                } else {
                    const lessSemver = parseSemver(lessPred.val);
                    const greaterSemver = parseSemver(greaterPred.val);
                    let needsFallback = false;
                    if (lessSemver === null || greaterSemver === null) {
                        needsFallback = true;
                    } else {
                        if (lessPred.op === '<') {
                            if (lessSemver.patch !== null && lessSemver.patch > 0) {
                                lessSemver.patch--;
                            } else if (lessSemver.minor !== null && lessSemver.minor > 0) {
                                lessSemver.major--;
                                lessSemver.patch = null;
                            } else {
                                needsFallback = true;
                            }
                        }
                        if (greaterPred.op === '>') {
                            let successfulInc = false;
                            if (greaterSemver.patch !== null) {
                                greaterSemver.patch++;
                                successfulInc = allVersions.find(it => it.id === greaterSemver.major + '.' + greaterSemver.minor + '.' + greaterSemver.patch);
                            }
                            if (!successfulInc) {
                                greaterSemver.patch = null;
                                if (greaterSemver.minor !== null) {
                                    greaterSemver.minor++;
                                    successfulInc = allVersions.find(it => it.id === greaterSemver.major + '.' + greaterSemver.minor);
                                }
                                if (!successfulInc) {
                                    if (greaterSemver.major !== 1) {
                                        needsFallback = true;
                                    }
                                }
                            }
                        }
                        if (!needsFallback) {
                            result = 'between ' + greaterSemver.major + '.';
                            if (greaterSemver.minor === null) {
                                result += 'x';
                            } else {
                                result += greaterSemver.minor;
                                if (greaterSemver.patch !== null) {
                                    result += '.' + greaterSemver.patch;
                                }
                            }
                            result += ' and ' + lessSemver.major + '.';
                            if (lessSemver.minor === null) {
                                result += 'x';
                            } else {
                                result += lessSemver.minor;
                                if (lessSemver.patch !== null) {
                                    result += '.' + lessSemver.patch;
                                }
                            }
                        }
                    }
                    if (needsFallback) {
                        result = 'between ' + greaterPred.val + (greaterPred.op === '>=' ? ' (inclusive)' : ' (exclusive)') +
                            ' and ' + lessPred.val + (lessPred.op === '<=' ? ' (inclusive)' : '(exclusive)');
                    }
                }
            } else if (lessPred !== null) {
                if (lessPred.op === '<') {
                    result = 'until ' + lessPred.val;
                } else {
                    result = 'up to ' + lessPred.val;
                }
            } else if (greaterPred !== null) {
                if (greaterPred.op === '>') {
                    result = 'after ' + greaterPred.val;
                } else {
                    result = 'since ' + greaterPred.val;
                }
            } else if (notPreds.length > 0 || parenPreds.length === 0) {
                result = 'all versions';
            }

            if (notPreds.length > 0) {
                const combined = [];
                for (let i = 0; i < notPreds.length; i++) {
                    const notPred = notPreds[i];
                    if (notPred.val.op === '(') {
                        Array.prototype.push.apply(combined, notPred.val.val);
                    } else {
                        combined.push([notPred.val]);
                    }
                }
                if (combined.length > 0) {
                    result += ' except ' + stringifyExpression(combined);
                }
            }

            // extra stuff we couldn't simplify to English
            for (let i = 0; i < parenPreds.length; i++) {
                if (result.length > 0) {
                    result += ' && ';
                }
                result += '(' + stringifyExpression(parenPreds[i].val) + ')';
            }

            return result;
        }

        return stringifyExpression(expression);
    }
}

class InlineMcVersionElement extends AbstractMcVersionElement {
    constructor() {
        super();
        const shadow = this.attachShadow({mode: 'open'});
        shadow.innerHTML = `
            <link rel="stylesheet" href="/pages/css/mcversion-inline.css">
            <div class="version-all">
              <div class="version-content">
                <slot></slot>
              </div>
              <div class="version-box" id="version-box"></div>
            </div>
        `;
    }
}

class BlockMcVersionElement extends AbstractMcVersionElement {
    constructor() {
        super();
        const shadow = this.attachShadow({mode: 'open'});
        shadow.innerHTML = `
            <link rel="stylesheet" href="/pages/css/mcversion-block.css">
            <div class="version-all">
              <div class="version-box" id="version-box"></div>
              <div class="version-content">
                <slot></slot>
              </div>
            </div>
        `;
    }
}

window.customElements.define('mc-version', InlineMcVersionElement);
window.customElements.define('mc-version-block', BlockMcVersionElement);

const onVersionChanged = function() {
    let selectedIndex = this.selectedIndex;
    if (selectedIndex === -1) {
        return;
    }
    let versions = this.versions;
    const selectedVersion = versions[selectedIndex].id;
    const mcVersionElements = Array.prototype.slice.call(document.getElementsByTagName('mc-version'));
    Array.prototype.push.apply(mcVersionElements, document.getElementsByTagName('mc-version-block'));
    for (let i = 0; i < mcVersionElements.length; i++) {
        const elt = mcVersionElements[i];
        elt.updateVersionText(versions);
        if (elt.shouldBeVisible(selectedVersion, versions)) {
            elt.classList.add('applied');
            elt.classList.remove('disapplied');
            elt.classList.remove('applied-red');
        } else {
            elt.classList.add(this.showAllVersions ? 'applied-red' : 'disapplied');
            elt.classList.remove('applied');
            elt.classList.remove(this.showAllVersions ? 'disapplied' : 'applied-red');
        }
    }
    window.sessionStorage.setItem('mcVersion', selectedVersion);
}

const updateVersionDropdown = function(launcherMeta, versionDropdown, allowSnapshots, showAllVersions) {
    versionDropdown.removeEventListener('change', onVersionChanged);

    let currentVersion = window.sessionStorage.getItem('mcVersion');
    if (currentVersion === null) {
        currentVersion = allowSnapshots ? launcherMeta.latest.snapshot : launcherMeta.latest.release;
    }
    let versions = launcherMeta.versions.slice();
    if (!allowSnapshots) {
        versions = versions.filter(function(ver) { return ver.type === 'release' })
    }
    const dateRegex = new RegExp('(\\d\\d\\d\\d)-(\\d\\d)-(\\d\\d)T(\\d\\d):(\\d\\d):(\\d\\d)(Z|\\+(\\d\\d):(\\d\\d))');
    // Sort versions into reverse chronological order
    versions.sort(function(ver1, ver2) { 
        const match1 = dateRegex.exec(ver1.releaseTime);
        const match2 = dateRegex.exec(ver2.releaseTime);
        const date1 = new Date(+match1[1], +match1[2], +match1[3], +match1[4], +match1[5], +match1[6]);
        const date2 = new Date(+match2[1], +match2[2], +match2[3], +match2[4], +match2[5], +match2[6]);
        return date2.getTime() - date1.getTime();
    });
    for (var i = versionDropdown.options.length - 1; i >= 0; i--) {
        versionDropdown.remove(i);
    }
    let selectedIndex = -1;
    for (var i = 0; i < versions.length; i++) {
        const option = document.createElement('option');
        option.value = versions[i].id;
        option.text = versions[i].id;
        versionDropdown.add(option);
        if (currentVersion === versions[i].id) {
            selectedIndex = i;
        }
    }
    versionDropdown.selectedIndex = selectedIndex;
    
    versionDropdown.addEventListener('change', onVersionChanged);
    versionDropdown.versions = versions;
    versionDropdown.showAllVersions = showAllVersions;
    onVersionChanged.call(versionDropdown);
}

const applyLauncherMeta = function(launcherMeta) {
    const versionDropdown = document.getElementById('mc-version');
    if (versionDropdown === null) {
        return;
    }
    const snapshotCheckbox = document.getElementById('allow-snapshots');
    
    let allowSnapshots = window.sessionStorage.getItem('allowSnapshots') === 'true';
    if (snapshotCheckbox !== null) {
        snapshotCheckbox.checked = allowSnapshots;
        snapshotCheckbox.addEventListener('change', function() {
            allowSnapshots = this.checked;
            window.sessionStorage.setItem('allowSnapshots', '' + allowSnapshots);
            updateVersionDropdown(launcherMeta, versionDropdown, allowSnapshots, showAllVersions);
        });
    }

    const showAllVersionsCheckbox = document.getElementById('show-all-versions');

    let showAllVersions = window.sessionStorage.getItem('showAllVersions') === 'true';
    if (showAllVersionsCheckbox !== null) {
        showAllVersionsCheckbox.checked = showAllVersions;
        showAllVersionsCheckbox.addEventListener('change', function() {
            showAllVersions = this.checked;
            window.sessionStorage.setItem('showAllVersions', '' + showAllVersions);
            updateVersionDropdown(launcherMeta, versionDropdown, allowSnapshots, showAllVersions);
        });
    }
    
    updateVersionDropdown(launcherMeta, versionDropdown, allowSnapshots, showAllVersions);
}

const applyLauncherMetaWhenLoaded = function(launcherMeta) {
    if (domContentLoaded) {
        applyLauncherMeta(launcherMeta);
    } else {
        const listener = function() {
            window.removeEventListener('DOMContentLoaded', listener);
            applyLauncherMeta(launcherMeta);
        };
        window.addEventListener('DOMContentLoaded', listener);
    }
};

// Fetch the Minecraft versions from Minecraft launcher metadata
(function() {
    let launcherMeta = window.sessionStorage.getItem('launcherMeta');
    if (launcherMeta !== null) {
        try {
            launcherMeta = JSON.parse(launcherMeta);
        } catch (err) {
            console.error('Error parsing launcherMeta in session storage, falling back to re-fetching');
            launcherMeta = null;
        }
    }
    if (launcherMeta !== null) {
        applyLauncherMetaWhenLoaded(launcherMeta);
    } else {
        fetch(new Request('https://launchermeta.mojang.com/mc/game/version_manifest.json'))
        .then(function(response) { return response.json(); })
        .then(function(data) {
            window.sessionStorage.setItem('launcherMeta', JSON.stringify(data));
            applyLauncherMetaWhenLoaded(data);
        })
        .catch(function(err) {
            console.error('Error fetching Minecraft versions: ' + err);
        });
    }
})();
