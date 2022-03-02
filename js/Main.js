

let domContentLoaded = false;

window.addEventListener('DOMContentLoaded', function() { domContentLoaded = true });

class McVersionElement extends HTMLElement {
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

    shouldBeVisible(selectedVersion, allVersions) {
        const selectedIndex = allVersions.findIndex(it => it.id === selectedVersion);

        const semverRegex = new RegExp('(\\d+)\\.(\\d+|x)(\\.(\\d+|x))?');
        const parseSemver = function(ver) {
            const val = semverRegex.exec(ver);
            if (val === null) {
                return null;
            } else {
                return {major: +val[1], minor: val[2] === 'x' ? null : +val[2], patch: val[4] === undefined || val[4] === 'x' ? null : +val[4]};
            }
        }

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
            let op = '=';
            if (range.startsWith('<=')) {
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

        let expression;
        try {
            expression = parseExpression();
            if (range.length > 0) {
                throw new Error('Trailing characters in version expression');
            }
        } catch (err) {
            console.error('Version predicate parsing failed: ' + err);
            return true;
        }

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
}

window.customElements.define('mc-version', McVersionElement);

const onVersionChanged = function() {
    let selectedIndex = this.selectedIndex;
    if (selectedIndex === -1) {
        return;
    }
    let versions = this.versions;
    const selectedVersion = versions[selectedIndex].id;
    const mcVersionElements = document.getElementsByTagName('mc-version');
    for (let i = 0; i < mcVersionElements.length; i++) {
        const elt = mcVersionElements[i];
        if (elt.shouldBeVisible(selectedVersion, versions)) {
            elt.classList.add('applied');
            elt.classList.remove('disapplied');
        } else {
            elt.classList.add('disapplied');
            elt.classList.remove('applied');
        }
    }
}

const updateVersionDropdown = function(launcherMeta, versionDropdown, allowSnapshots) {
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
    onVersionChanged.call(versionDropdown);
}

const applyLauncherMeta = function(launcherMeta) {
    const versionDropdown = document.getElementById('mc-version');
    if (versionDropdown === null) {
        return;
    }
    const snapshotCheckbox = document.getElementById('allow-snapshots');
    
    const allowSnapshots = window.sessionStorage.getItem('allowSnapshots') === 'true';
    if (snapshotCheckbox !== null) {
        snapshotCheckbox.checked = allowSnapshots;
        snapshotCheckbox.addEventListener('change', function() {
            window.sessionStorage.setItem('allowSnapshots', '' + this.checked);
            updateVersionDropdown(launcherMeta, versionDropdown, this.checked);
        });
    }
    
    updateVersionDropdown(launcherMeta, versionDropdown, allowSnapshots);
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
