import {html, css} from 'lit';
import {customElement} from 'lit/decorators.js';
import {AIUXElement} from '@servicenow/aiux/aiux-components-core';
import '../../widgets/aiux-ai-asset-honeycomb/index.js';

@customElement('x-snc-james-test-a-home-page')
export default class HomePage extends AIUXElement {
  static styles = css`
    :host {
      display: block;
    }
  `;

  render() {
    return html`
      <div class="mx-auto max-w-6xl">
        <aiux-ai-asset-honeycomb></aiux-ai-asset-honeycomb>
      </div>
    `;
  }
}
