/** WGSL Preprocessor v1.0.0 **/
const preprocessorSymbols = /#([^\s]*)(\s*)/gm

class ConditionalState {
  elseIsValid = true;
  branches = [];

  constructor(initialExpression) {
    this.pushBranch('if', initialExpression);
  }

  pushBranch(token, expression) {
    if (!this.elseIsValid) {
      throw new Error(`#${token} not preceeded by an #if or #elif`);
    }
    this.elseIsValid = (token === 'if' || token === 'elif');
    this.branches.push({
      expression: !!expression,
      string: ''
    });
  }

  appendStringToCurrentBranch(...strings) {
    for (const string of strings) {
      this.branches[this.branches.length-1].string += string;
    }
  }

  resolve() {
    for (const branch of this.branches) {
      if (branch.expression) {
        return branch.string;
      }
    }

    return '';
  }
}

// Template literal tag that handles simple preprocessor symbols for WGSL
// shaders. Supports #if/elif/else/endif statements.
export function wgsl(strings, ...values) {
  const stateStack = [];
  let state = new ConditionalState(true);
  state.elseIsValid = false;
  let depth = 1;

  const assertTemplateFollows = (match, string) => {
    if (match.index + match[0].length != string.length) {
      throw new Error(`#${match[1]} must be immediately followed by a template expression (ie: \${value})`);
    }
  }

  for (let i = 0; i < strings.length; ++i) {
    const string = strings[i];
    const matchedSymbols = string.matchAll(preprocessorSymbols);

    let lastIndex = 0;
    let valueConsumed = false;

    for (const match of matchedSymbols) {
      state.appendStringToCurrentBranch(string.substring(lastIndex, match.index));

      switch (match[1]) {
        case 'if':
          assertTemplateFollows(match, string);

          valueConsumed = true;
          stateStack.push(state);
          state = new ConditionalState(values[i]);
          break;
        case 'elif':
          assertTemplateFollows(match, string);

          valueConsumed = true;
          state.pushBranch(match[1], values[i]);
          break;
        case 'else':
          state.pushBranch(match[1], true);
          state.appendStringToCurrentBranch(match[2]);
          break;
        case 'endif':
          if (!stateStack.length) {
            throw new Error(`#${match[1]} not preceeded by an #if`);
          }

          const result = state.resolve();

          state = stateStack.pop();
          state.appendStringToCurrentBranch(result, match[2]);
          break;
        default:
          // Unknown preprocessor symbol. Emit it back into the output string unchanged.
          state.appendStringToCurrentBranch(match[0]);
          break;
      }

      lastIndex = match.index + match[0].length;
    }

    // If the string didn't end on one of the preprocessor symbols append the rest of it here.
    if (lastIndex != string.length) {
      state.appendStringToCurrentBranch(string.substring(lastIndex, string.length));
    }

    // If the next value wasn't consumed by the preprocessor symbol, append it here.
    if (!valueConsumed && values.length > i) {
      state.appendStringToCurrentBranch(values[i]);
    }
  }

  if (stateStack.length) {
    throw new Error('Mismatched #if/#endif count');
  }

  return state.resolve();
}