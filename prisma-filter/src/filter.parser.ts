import { FilterOperationType, FilterOrder, IFilter, ISingleFilter, ISingleOrder } from '@chax-at/prisma-filter-common';
import { GeneratedFindOptions } from './filter.interface';
import { IntFilter, StringFilter } from './prisma.type';

export class FilterParser<TDto, TWhereInput> {
  /**
   *
   * @param mapping - An object mapping from Dto key to database key
   * @param allowAllFields - Allow filtering on *all* top-level keys. Warning! Only use this if the user should have access to ALL data of the column
   */
  constructor(
    private readonly mapping: { [p in keyof TDto]?: keyof TWhereInput & string },
    private readonly allowAllFields = false,
  ) { }

  public generateQueryFindOptions(filterDto: IFilter<TDto>): GeneratedFindOptions<TWhereInput> {
    if(filterDto.filter == null) {
      filterDto.filter = [];
    }
    if(filterDto.order == null) {
      filterDto.order = [];
    }

    const where = this.generateWhere(filterDto.filter);
    const generatedOrder = this.generateOrder(filterDto.order);
    return {
      where: where as TWhereInput,
      skip: filterDto.offset,
      take: filterDto.limit,
      orderBy: generatedOrder,
    };
  }

  private generateWhere(filter: Array<ISingleFilter<TDto>>): { [p in keyof TWhereInput]?: any } {
    const where: { [p in keyof TWhereInput]?: any } = Object.create(null);
    for(const filterEntry of filter) {
      const fieldName = filterEntry.field;
      let dbFieldName = this.mapping[filterEntry.field];

      if(dbFieldName == null) {
        if(this.allowAllFields && !fieldName.includes('.')) {
          dbFieldName = fieldName as unknown as (keyof TWhereInput & string);
        } else {
          throw new Error(`${fieldName} is not filterable`);
        }
      }
      if(dbFieldName.length > 0 && dbFieldName[0] === '!') {
        continue;
      }
      const dbFieldNameParts = dbFieldName.split('.');
      let currentWhere: any = where;

      for(const dbFieldPart of dbFieldNameParts) {
        if(currentWhere[dbFieldPart] == null) {
          currentWhere[dbFieldPart] = Object.create(null);
        }
        currentWhere = currentWhere[dbFieldPart];
      }
      Object.assign(currentWhere, this.generateWhereValue(filterEntry.type, filterEntry.value));
    }
    return where;
  }

  private generateWhereValue(type: FilterOperationType, value: any): { [p in keyof IntFilter | keyof StringFilter]?: any } {
    const queryValue = this.getFormattedQueryValueForType(value, type);
    if(
      [FilterOperationType.Ilike, FilterOperationType.IContains,
       FilterOperationType.ISearch, FilterOperationType.IStartsWith,
       FilterOperationType.IEndsWith].includes(type)
    ) {
      return {
        [this.getOpByType(type)]: queryValue,
        mode: 'insensitive',
      };
    }
    return {
      [this.getOpByType(type)]: queryValue,
    };
  }

  private getFormattedQueryValueForType(rawValue: any, type: FilterOperationType): string | number | string[] | number[] | boolean | null {
    if(Array.isArray(rawValue)) {
      if(rawValue.some(value => typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')) {
        throw new Error(`Array filter value must be an Array<string|number|boolean>`);
      }
      if(type === FilterOperationType.InStrings || type === FilterOperationType.NotInStrings) return rawValue;
      if(type !== FilterOperationType.In && type !== FilterOperationType.NotIn) {
        throw new Error(`Filter type ${type} does not support array values`);
      }
      return rawValue.map(v => !isNaN(+v) ? +v : v);
    }

    if(typeof rawValue !== 'string' && typeof rawValue !== 'number' && typeof rawValue !== 'boolean') {
      throw new Error(`Filter value must be a string, a number or a boolean`);
    }

    if(type === FilterOperationType.EqNull || type === FilterOperationType.NeNull) {
      // When the operator is of type equal/not equal null: ignore the filter value and set it to null. Otherwise, the value will be taken as a string ('null')
      return null;
    }

    if(type === FilterOperationType.Eq || type === FilterOperationType.Ne) {
      // If we filter for equality and the value looks like a boolean, then cast it into a boolean
      if(rawValue === 'true') {
        return true;
      } else if(rawValue === 'false') return false;
    }

    if([FilterOperationType.Like, FilterOperationType.Ilike, FilterOperationType.Contains, FilterOperationType.IContains,
    FilterOperationType.EqString, FilterOperationType.NeString, FilterOperationType.StartsWith, FilterOperationType.IStartsWith,
    FilterOperationType.EndsWith, FilterOperationType.IEndsWith, FilterOperationType.Search, FilterOperationType.ISearch].includes(type)) {
      // Never cast this value for a like filter because this only applies to strings
      return rawValue;
    }

    return !isNaN(+rawValue) ? +rawValue : rawValue;
  }

  private getOpByType(type: FilterOperationType): keyof IntFilter | keyof StringFilter {
    switch(type) {
      case FilterOperationType.Eq:
      case FilterOperationType.EqNull:
      case FilterOperationType.EqString:
        return 'equals';
      case FilterOperationType.Lt:
        return 'lt';
      case FilterOperationType.Lte:
        return 'lte';
      case FilterOperationType.Gt:
        return 'gt';
      case FilterOperationType.Gte:
        return 'gte';
      case FilterOperationType.Ne:
      case FilterOperationType.NeNull:
      case FilterOperationType.NeString:
        return 'not';
      case FilterOperationType.Like:
      case FilterOperationType.Ilike:
      case FilterOperationType.Contains:
      case FilterOperationType.IContains:
        return 'contains';
      case FilterOperationType.StartsWith:
      case FilterOperationType.IStartsWith:
        return 'startsWith';
      case FilterOperationType.EndsWith:
      case FilterOperationType.IEndsWith:
        return 'endsWith';
      case FilterOperationType.Search:
      case FilterOperationType.ISearch:
        return 'search' as any; // This is a preview feature
      case FilterOperationType.In:
      case FilterOperationType.InStrings:
        return 'in';
      case FilterOperationType.NotIn:
      case FilterOperationType.NotInStrings:
        return 'notIn';
      default:
        throw new Error(`${type} is not a valid filter type`);
    }
  }

  private generateOrder(order: Array<ISingleOrder<TDto>>): Array<{ [p in keyof TWhereInput]?: FilterOrder }> {
    const generatedOrder = [];
    for(const orderEntry of order) {
      const fieldName = orderEntry.field;
      let dbFieldName = this.mapping[fieldName];

      if(dbFieldName == null) {
        if(this.allowAllFields && !fieldName.includes('.')) {
          dbFieldName = fieldName as unknown as (keyof TWhereInput & string);
        } else {
          throw new Error(`${fieldName} is not sortable`);
        }
      }

      if(dbFieldName.length > 0 && dbFieldName[0] === '!') {
        continue;
      }

      const dbFieldNameParts = dbFieldName.split('.');
      const sortObjToAdd = Object.create(null);
      let currentObj: any = sortObjToAdd;

      for(let i = 0; i < dbFieldNameParts.length; i++) {
        const dbFieldPart = dbFieldNameParts[i];
        if(currentObj[dbFieldPart] == null) {
          currentObj[dbFieldPart] = Object.create(null);
        }
        if(i < dbFieldNameParts.length - 1) {
          currentObj = currentObj[dbFieldPart];
        } else {
          currentObj[dbFieldPart] = orderEntry.dir;
        }
      }

      generatedOrder.push(sortObjToAdd);
    }
    return generatedOrder as Array<{ [p in keyof TWhereInput]?: FilterOrder }>;
  }
}
