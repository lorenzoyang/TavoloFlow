FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source
COPY global.json .
COPY .config/dotnet-tools.json .config/dotnet-tools.json
COPY backend/TavoloFlow.Api/TavoloFlow.Api.csproj backend/TavoloFlow.Api/
RUN dotnet restore backend/TavoloFlow.Api/TavoloFlow.Api.csproj && dotnet tool restore
COPY backend/TavoloFlow.Api backend/TavoloFlow.Api
RUN dotnet publish backend/TavoloFlow.Api -c Release --no-restore -o /publish /p:UseAppHost=false \
    && ConnectionStrings__Default='Host=localhost;Database=build_only;Username=build_only;Password=unused' \
       dotnet ef migrations bundle --project backend/TavoloFlow.Api --configuration Release --no-build --output /publish/efbundle

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
RUN mkdir -p /var/lib/tavoloflow/keys && chown -R 1654:1654 /var/lib/tavoloflow
COPY --from=build /publish .
ENV ASPNETCORE_HTTP_PORTS=8080
USER 1654
EXPOSE 8080
ENTRYPOINT ["dotnet", "TavoloFlow.Api.dll"]

FROM runtime AS migrations
ENTRYPOINT ["/app/efbundle"]
