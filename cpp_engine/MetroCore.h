#ifndef METRO_CORE_H
#define METRO_CORE_H
#include <string>

struct Edge {
    int to;
    double minutes;
    double kilometres;
    Edge* next;
    Edge(int destination, double time, double km, Edge* link)
        : to(destination), minutes(time), kilometres(km), next(link) {}
};

class MetroGraph {
    struct Station {
        std::string id;
        double crowd;
        Edge* first;
        Station() : crowd(0), first(0) {}
    };
    Station* stations;
    int count;
    int capacity;
    struct HashEntry { int station; HashEntry* next; HashEntry(int s, HashEntry* n) : station(s), next(n) {} };
    HashEntry** buckets;
    int bucketCount;
    unsigned long hashId(const std::string& id) const;
    void rehash(int newCount);
    void expand();
    MetroGraph(const MetroGraph&);
    MetroGraph& operator=(const MetroGraph&);
public:
    MetroGraph();
    ~MetroGraph();
    int addStation(const std::string& id, double crowdRatio);
    int indexOf(const std::string& id) const;
    const std::string& idOf(int i) const;
    double crowdAt(int i) const;
    void setCrowd(int i, double ratio);
    void addConnection(int from, int to, double minutes, double km);
    const Edge* neighbors(int i) const;
    int size() const;
};

struct HeapEntry { double cost; int station; };
class MinHeap {
    HeapEntry* items;
    int used, capacity;
    void grow();
    MinHeap(const MinHeap&);
    MinHeap& operator=(const MinHeap&);
public:
    MinHeap();
    ~MinHeap();
    bool empty() const;
    void push(double cost, int station);
    HeapEntry pop();
};

struct RouteResult {
    bool found;
    int* nodes;
    int length;
    double cost;
    double minutes;
    double kilometres;
    RouteResult() : found(false), nodes(0), length(0), cost(0), minutes(0), kilometres(0) {}
    ~RouteResult() { delete[] nodes; }
    RouteResult(const RouteResult&);
    RouteResult& operator=(const RouteResult&);
};

// crowdWeight = 0 gives fastest route; positive values penalise busy stations.
RouteResult findRoute(const MetroGraph& graph, int source, int destination, double crowdWeight);
#endif
