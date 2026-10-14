using FluentResults;
using Gridify;
using Mapster;
using Microsoft.EntityFrameworkCore;
using Automation.SharedKernel.Domain.Interfaces;
using Automation.SharedKernel.Abstractions.Querying;

namespace Automation.SharedKernel.Infrastructure.Querying;

public static class QueryableExtensions
{
    static QueryableExtensions()
    {
        GridifyGlobalConfiguration.CustomOperators.Register(new GridifyUnaccentOperator());
    }

    private static string MapOperator(FilterOperator op) => op switch
    {
        FilterOperator.Equal => "=",
        FilterOperator.NotEqual => "!=",
        FilterOperator.Contains => "=*",
        FilterOperator.GreaterThan => ">",
        FilterOperator.GreaterThanOrEqual => ">=",
        FilterOperator.LessThan => "<",
        FilterOperator.LessThanOrEqual => "<=",
        _ => "="
    };

    private static string? BuildFilterString<T>(PagedQuery paged, IGridifyMapper<T> mapper)
    {
        var parts = new List<string>();

        if (paged.Filters is { Count: > 0 })
        {
            foreach (var f in paged.Filters)
            {
                // Validate if field exists in mapper before building and value is not empty
                if (mapper.HasMap(f.Field) && !string.IsNullOrWhiteSpace(f.Value))
                {
                    // Escape commas and pipes if present
                    var safeValue = f.Value.Replace(",", "\\,").Replace("|", "\\|");
                    parts.Add($"{f.Field}{MapOperator(f.Operator)}{safeValue}");
                }
            }
        }

        if (!string.IsNullOrWhiteSpace(paged.GlobalKeyword))
        {
            // Find all string fields mapped in the GridifyMapper for global search
            var stringFields = typeof(T).GetProperties()
                .Where(p => p.PropertyType == typeof(string))
                .Select(p => p.Name)
                .Where(mapper.HasMap)
                .ToList();
            
            if (stringFields.Count > 0)
            {
                var globalConditions = stringFields.Select(f => $"{f}#==*{paged.GlobalKeyword}");
                parts.Add($"({string.Join("|", globalConditions)})");
            }
        }

        return parts.Count > 0 ? string.Join(",", parts) : null;
    }

    private static string? BuildSortString(PagedQuery paged)
    {
        if (paged.Sort is not { Count: > 0 }) return null;

        var parts = new List<string>();
        foreach (var (field, isAscending) in paged.Sort)
        {
            parts.Add(isAscending ? field : $"{field} desc");
        }

        return string.Join(",", parts);
    }

    public static async Task<Result<PagedResult<TDestination>>> ToPagedResultAsync<TEntity, TDestination>(
        this IQueryable<TEntity> query,
        PagedQuery paged,
        IGridifyMapper<TEntity> mapper,
        CancellationToken ct = default)
    {
        var actualPage = paged.Page ?? 1;
        var actualPageSize = paged.PageSize ?? 10;

        var gq = new GridifyQuery
        {
            Filter = BuildFilterString(paged, mapper),
            OrderBy = BuildSortString(paged),
            Page = Math.Max(1, actualPage),
            PageSize = Math.Max(1, actualPageSize)
        };

        if (!gq.IsValid<TEntity>(mapper))
        {
            return Result.Fail("Invalid query fields provided.");
        }

        Console.WriteLine($"[GRIDIFY_FILTER] {gq.Filter}");

        var filteredQuery = query
            .ApplyFiltering(gq, mapper);

        if (string.IsNullOrWhiteSpace(gq.OrderBy))
        {
            if (typeof(IAuditable).IsAssignableFrom(typeof(TEntity)))
            {
                filteredQuery = filteredQuery.Cast<IAuditable>()
                    .OrderByDescending(x => x.CreatedAt)
                    .Cast<TEntity>();
            }
        }
        else
        {
            filteredQuery = filteredQuery.ApplyOrdering(gq, mapper);
        }

        var totalCount = await filteredQuery.CountAsync(ct);

        List<TDestination> items;
        if (typeof(TEntity) == typeof(TDestination))
        {
            var entityItems = await filteredQuery
                .ApplyPaging(gq.Page, gq.PageSize)
                .ToListAsync(ct);
            items = (List<TDestination>)(object)entityItems;
        }
        else
        {
            items = await filteredQuery
                .ApplyPaging(gq.Page, gq.PageSize)
                .ProjectToType<TDestination>()
                .ToListAsync(ct);
        }

        return Result.Ok(PagedResult<TDestination>.From(items, totalCount, actualPage, actualPageSize));
    }

    // Overload that doesn't project - keeps TEntity as output
    public static async Task<Result<PagedResult<TEntity>>> ToPagedResultAsync<TEntity>(
        this IQueryable<TEntity> query,
        PagedQuery paged,
        IGridifyMapper<TEntity> mapper,
        CancellationToken ct = default)
        => await query.ToPagedResultAsync<TEntity, TEntity>(paged, mapper, ct);
}



