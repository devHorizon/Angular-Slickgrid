import { TranslateService } from '@ngx-translate/core';
import {
  Column,
  Editor,
  EditorCustomStructure,
  EditorValidator,
  EditorValidatorOutput,
  GridOption,
  MultipleSelectOption,
  SelectOption,
} from './../models/index';
import { CollectionService } from '../services/index';
import { arraysEqual, findOrDefault, htmlEncode, unsubscribeAllObservables } from '../services/utilities';
import { Subscription } from 'rxjs/Subscription';
import * as DOMPurify_ from 'dompurify';
const DOMPurify = DOMPurify_; // patch to fix rollup to work

// height in pixel of the multiple-select DOM element
const SELECT_ELEMENT_HEIGHT = 26;

// using external non-typed js libraries
declare var $: any;

/**
 * Slickgrid editor class for multiple/single select lists
 */
export class SelectEditor implements Editor {
  /** The JQuery DOM element */
  $editorElm: any;

  /** Editor Multiple-Select options */
  editorElmOptions: MultipleSelectOption;

  /** The multiple-select options for a multiple select list */
  defaultOptions: MultipleSelectOption;

  /** The default item values that are set */
  defaultValue: any[];

  /** The property name for values in the collection */
  valueName: string;

  /** The property name for labels in the collection */
  labelName: string;

  /** The property name for a prefix that can be added to the labels in the collection */
  labelPrefixName: string;

  /** The property name for a suffix that can be added to the labels in the collection */
  labelSuffixName: string;

  /** Grid options */
  gridOptions: GridOption;

  /** Do we translate the label? */
  enableTranslateLabel: boolean;

  /** Observable Subscriptions */
  _subscriptions: Subscription[] = [];

  /** Collection Service */
  protected _collectionService: CollectionService;

  /** The i18n aurelia library */
  protected _translate: TranslateService;

  constructor(protected args: any, protected isMultipleSelect) {
    this.gridOptions = this.args.grid.getOptions() as GridOption;
    const gridOptions = this.gridOptions || this.args.column.params || {};
    this._translate = gridOptions.i18n;

    const libOptions: MultipleSelectOption = {
      container: 'body',
      filter: false,
      maxHeight: 200,
      width: 150,
      offsetLeft: 20,
      single: true,
      onOpen: () => this.autoAdjustDropPosition(this.$editorElm, this.editorElmOptions),
      textTemplate: ($elm) => {
        // render HTML code or not, by default it is sanitized and won't be rendered
        const isRenderHtmlEnabled = this.columnDef && this.columnDef.internalColumnEditor && this.columnDef.internalColumnEditor.enableRenderHtml || false;
        return isRenderHtmlEnabled ? $elm.text() : $elm.html();
      },
    };

    if (isMultipleSelect) {
      libOptions.single = false;
      libOptions.addTitle = true;
      libOptions.okButton = true;
      libOptions.selectAllDelimiter = ['', ''];

      if (this._translate) {
        libOptions.countSelected = this._translate.instant('X_OF_Y_SELECTED');
        libOptions.allSelected = this._translate.instant('ALL_SELECTED');
        libOptions.selectAllText = this._translate.instant('SELECT_ALL');
      }
    }

    // assign the multiple select lib options
    this.defaultOptions = libOptions;

    this.init();
  }

  /** Get the Collection */
  get collection(): any[] {
    return this.columnDef && this.columnDef && this.columnDef.internalColumnEditor.collection || [];
  }

  /** Get Column Definition object */
  get columnDef(): Column {
    return this.args && this.args.column || {};
  }

  /** Get Column Editor object */
  get columnEditor(): any {
    return this.columnDef && this.columnDef.internalColumnEditor && this.columnDef.internalColumnEditor || {};
  }

  /** Getter for the Custom Structure if exist */
  protected get customStructure(): EditorCustomStructure {
    return this.columnDef && this.columnDef.internalColumnEditor && this.columnDef.internalColumnEditor.customStructure;
  }

  /**
   * The current selected values (multiple select) from the collection
   */
  get currentValues() {
    const separatorBetweenLabels = this.customStructure && this.customStructure.separatorBetweenTextLabels || '';
    const isIncludingPrefixSuffix = this.customStructure && this.customStructure.includePrefixSuffixToSelectedValues || false;

    return this.collection
      .filter(c => this.$editorElm.val().indexOf(c[this.valueName].toString()) !== -1)
      .map(c => {
        const labelText = c[this.valueName];
        const prefixText = c[this.labelPrefixName] || '';
        const suffixText = c[this.labelSuffixName] || '';

        if (isIncludingPrefixSuffix) {
          return (prefixText + separatorBetweenLabels + labelText + separatorBetweenLabels + suffixText);
        }
        return labelText;
      });
  }


  /**
   * The current selected values (single select) from the collection
   */
  get currentValue() {
    const separatorBetweenLabels = this.customStructure && this.customStructure.separatorBetweenTextLabels || '';
    const isIncludingPrefixSuffix = this.customStructure && this.customStructure.includePrefixSuffixToSelectedValues || false;
    const itemFound = findOrDefault(this.collection, (c: any) => c[this.valueName].toString() === this.$editorElm.val());

    if (itemFound) {
      const labelText = itemFound[this.valueName];

      if (isIncludingPrefixSuffix) {
        const prefixText = itemFound[this.labelPrefixName] || '';
        const suffixText = itemFound[this.labelSuffixName] || '';
        return (prefixText + separatorBetweenLabels + labelText + separatorBetweenLabels + suffixText);
      }

      return labelText;
    }

    return '';
  }


  /** Get the Validator function, can be passed in Editor property or Column Definition */
  get validator(): EditorValidator {
    return this.columnEditor.validator || this.columnDef.validator;
  }

  init() {
    if (!this.args) {
      throw new Error('[Angular-SlickGrid] An editor must always have an "init()" with valid arguments.');
    }

    if (!this.columnDef || !this.columnDef.internalColumnEditor || (!this.columnDef.internalColumnEditor.collection && !this.columnDef.internalColumnEditor.collectionAsync)) {
      throw new Error(`[Angular-SlickGrid] You need to pass a "collection" (or "collectionAsync") inside Column Definition Editor for the MultipleSelect/SingleSelect Editor to work correctly.
      Also each option should include a value/label pair (or value/labelKey when using Locale).
      For example: { editor: { collection: [{ value: true, label: 'True' },{ value: false, label: 'False'}] } }`);
    }

    this._collectionService = new CollectionService(this._translate);
    this.enableTranslateLabel = (this.columnDef.internalColumnEditor.enableTranslateLabel) ? this.columnDef.internalColumnEditor.enableTranslateLabel : false;
    this.labelName = (this.customStructure) ? this.customStructure.label : 'label';
    this.labelPrefixName = (this.customStructure) ? this.customStructure.labelPrefix : 'labelPrefix';
    this.labelSuffixName = (this.customStructure) ? this.customStructure.labelSuffix : 'labelSuffix';
    this.valueName = (this.customStructure) ? this.customStructure.value : 'value';

    // always render the Select (dropdown) DOM element, even if user passed a "collectionAsync",
    // if that is the case, the Select will simply be without any options but we still have to render it (else SlickGrid would throw an error)
    this.renderDomElement(this.collection);
  }

  applyValue(item: any, state: any): void {
    item[this.columnDef.field] = state;
  }

  destroy() {
    if (this.$editorElm) {
      this.$editorElm.remove();
    }
    this._subscriptions = unsubscribeAllObservables(this._subscriptions);
  }

  loadValue(item: any): void {
    if (this.isMultipleSelect) {
      // convert to string because that is how the DOM will return these values
      this.defaultValue = item[this.columnDef.field].map((i: any) => i.toString());

      this.$editorElm.find('option').each((i: number, $e: any) => {
        if (this.defaultValue.indexOf($e.value) !== -1) {
          $e.selected = true;
        } else {
          $e.selected = false;
        }
      });
    } else {
      this.loadSingleValue(item);
    }

    this.refresh();
  }

  loadSingleValue(item: any) {
    // convert to string because that is how the DOM will return these values
    // make sure the prop exists first
    this.defaultValue = item[this.columnDef.field] && item[this.columnDef.field].toString();

    this.$editorElm.find('option').each((i: number, $e: any) => {
      if (this.defaultValue === $e.value) {
        $e.selected = true;
      } else {
        $e.selected = false;
      }
    });
  }

  serializeValue(): any {
    return (this.isMultipleSelect) ? this.currentValues : this.currentValue;
  }

  focus() {
    this.$editorElm.focus();
  }

  isValueChanged(): boolean {
    if (this.isMultipleSelect) {
      return !arraysEqual(this.$editorElm.val(), this.defaultValue);
    }
    return this.$editorElm.val() !== this.defaultValue;
  }

  validate(): EditorValidatorOutput {
    if (this.validator) {
      const validationResults = this.validator(this.isMultipleSelect ? this.currentValues : this.currentValue);
      if (!validationResults.valid) {
        return validationResults;
      }
    }

    // by default the editor is always valid
    // if user want it to be a required checkbox, he would have to provide his own validator
    return {
      valid: true,
      msg: null
    };
  }

  //
  // protected functions
  // ------------------

  /**
   * user might want to filter certain items of the collection
   * @param inputCollection
   * @return outputCollection filtered and/or sorted collection
   */
  protected filterCollection(inputCollection) {
    let outputCollection = inputCollection;

    // user might want to filter certain items of the collection
    if (this.columnDef.internalColumnEditor && this.columnDef.internalColumnEditor.collectionFilterBy) {
      const filterBy = this.columnDef.internalColumnEditor.collectionFilterBy;
      outputCollection = this._collectionService.filterCollection(outputCollection, filterBy);
    }

    return outputCollection;
  }

  /**
   * user might want to sort the collection in a certain way
   * @param inputCollection
   * @return outputCollection filtered and/or sorted collection
   */
  protected sortCollection(inputCollection) {
    let outputCollection = inputCollection;

    // user might want to sort the collection
    if (this.columnDef.internalColumnEditor && this.columnDef.internalColumnEditor.collectionSortBy) {
      const sortBy = this.columnDef.internalColumnEditor.collectionSortBy;
      outputCollection = this._collectionService.sortCollection(outputCollection, sortBy, this.enableTranslateLabel);
    }

    return outputCollection;
  }

  protected renderDomElement(collection: any[]) {
    let newCollection = collection || [];

    // user might want to filter and/or sort certain items of the collection
    newCollection = this.filterCollection(newCollection);
    newCollection = this.sortCollection(newCollection);

    // step 1, create HTML string template
    const editorTemplate = this.buildTemplateHtmlString(newCollection);

    // step 2, create the DOM Element of the editor
    // also subscribe to the onClose event
    this.createDomElement(editorTemplate);
  }

  protected buildTemplateHtmlString(collection: any[]) {
    let options = '';
    const separatorBetweenLabels = this.customStructure && this.customStructure.separatorBetweenTextLabels || '';
    const isRenderHtmlEnabled = this.columnDef.internalColumnEditor.enableRenderHtml || false;
    const sanitizedOptions = this.gridOptions && this.gridOptions.sanitizeHtmlOptions || {};

    collection.forEach((option: SelectOption) => {
      if (!option || (option[this.labelName] === undefined && option.labelKey === undefined)) {
        throw new Error(`A collection with value/label (or value/labelKey when using Locale) is required to populate the Select list, for example: { collection: [ { value: '1', label: 'One' } ])`);
      }
      const labelKey = (option.labelKey || option[this.labelName]) as string;
      const labelText = ((option.labelKey || this.enableTranslateLabel) && this._translate && typeof this._translate.instant === 'function') ? this._translate.instant(labelKey || ' ') : labelKey;
      const prefixText = option[this.labelPrefixName] || '';
      const suffixText = option[this.labelSuffixName] || '';
      let optionText = (prefixText + separatorBetweenLabels + labelText + separatorBetweenLabels + suffixText);

      // if user specifically wants to render html text, he needs to opt-in else it will stripped out by default
      // also, the 3rd party lib will saninitze any html code unless it's encoded, so we'll do that
      if (isRenderHtmlEnabled) {
        // sanitize any unauthorized html tags like script and others
        // for the remaining allowed tags we'll permit all attributes
        const sanitizedText = DOMPurify.sanitize(optionText, sanitizedOptions);
        optionText = htmlEncode(sanitizedText);
      }

      options += `<option value="${option[this.valueName]}">${optionText}</option>`;
    });

    return `<select class="ms-filter search-filter" ${this.isMultipleSelect ? 'multiple="multiple"' : ''}>${options}</select>`;
  }

  /**
   * Automatically adjust the multiple-select dropup or dropdown by available space
   */
  protected autoAdjustDropPosition(multipleSelectDomElement: any, multipleSelectOptions: MultipleSelectOption) {
    // height in pixel of the multiple-select element
    const selectElmHeight = SELECT_ELEMENT_HEIGHT;

    const windowHeight = $(window).innerHeight() || 300;
    const pageScroll = $('body').scrollTop() || 0;
    const $msDropContainer = multipleSelectOptions.container ? $(multipleSelectOptions.container) : multipleSelectDomElement;
    const $msDrop = $msDropContainer.find('.ms-drop');
    const msDropHeight = $msDrop.height() || 0;
    const msDropOffsetTop = $msDrop.offset().top;
    const space = windowHeight - (msDropOffsetTop - pageScroll);

    if (space < msDropHeight) {
      if (multipleSelectOptions.container) {
        // when using a container, we need to offset the drop ourself
        // and also make sure there's space available on top before doing so
        const newOffsetTop = (msDropOffsetTop - msDropHeight - selectElmHeight);
        if (newOffsetTop > 0) {
          $msDrop.offset({ top: newOffsetTop < 0 ? 0 : newOffsetTop });
        }
      } else {
        // without container, we simply need to add the "top" class to the drop
        $msDrop.addClass('top');
      }
      $msDrop.removeClass('bottom');
    } else {
      $msDrop.addClass('bottom');
      $msDrop.removeClass('top');
    }
  }

  /** Build the template HTML string */
  protected createDomElement(editorTemplate: string) {
    this.$editorElm = $(editorTemplate);

    if (this.$editorElm && typeof this.$editorElm.appendTo === 'function') {
      this.$editorElm.appendTo(this.args.container);
    }

    if (typeof this.$editorElm.multipleSelect !== 'function') {
      // fallback to bootstrap
      this.$editorElm.addClass('form-control');
    } else {
      const elementOptions = (this.columnDef.internalColumnEditor) ? this.columnDef.internalColumnEditor.elementOptions : {};
      this.editorElmOptions = { ...this.defaultOptions, ...elementOptions };
      this.$editorElm = this.$editorElm.multipleSelect(this.editorElmOptions);
      setTimeout(() => this.$editorElm.multipleSelect('open'));
    }
  }

  // refresh the jquery object because the selected checkboxes were already set
  // prior to this method being called
  protected refresh() {
    if (typeof this.$editorElm.multipleSelect === 'function') {
      this.$editorElm.multipleSelect('refresh');
    }
  }
}
