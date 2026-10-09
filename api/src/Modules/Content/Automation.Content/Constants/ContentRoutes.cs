namespace Automation.Content.Constants;

public static class ContentRoutes
{
    public const string ContentItem = "/contents/{id}";
    public const string ContentType = "/content-types/{id}";
    public const string NestedContentTypes = "/projects/{projectId}/content-types";
    public const string NestedContentItems = "/projects/{projectId}/content-types/{key}/contents";
    public const string NestedContentItemDetail = "/projects/{projectId}/content-types/{contentTypeKey}/contents/{keyOrId}";
    public const string ContentItemsLookup = "/projects/{projectId}/contents/lookup";
}