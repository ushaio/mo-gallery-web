import HorizontalRule from '@tiptap/extension-horizontal-rule'

export const StyledHorizontalRule = HorizontalRule.extend({
  renderHTML() {
    return ['hr', {
      style: 'border: none; border-top: 1px solid currentColor; margin: 2rem 0;',
    }]
  },
})
